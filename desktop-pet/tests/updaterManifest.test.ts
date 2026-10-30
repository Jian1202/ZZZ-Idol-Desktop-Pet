import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createUpdaterManifest } from "../scripts/updater-manifest.mjs";

const syncMetadata = createRequire(import.meta.url)("../../.github/scripts/sync-release-metadata.cjs");
const signature = Buffer.from("untrusted comment: 测试签名格式\n测试数据").toString("base64");
const repository = "example/pet";
const prefix = `https://github.com/${repository}/releases/download/v0.1.22/`;

test("更新清单区分 NSIS 与 MSI，并要求两个安装包都有签名", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zzz-manifest-"));
  try {
    for (const suffix of ["x64-setup.exe", "x64_en-US.msi"]) {
      const name = `Pet_0.1.22_${suffix}`;
      await writeFile(path.join(directory, name), "测试安装包");
      await writeFile(path.join(directory, name + ".sig"), signature);
    }
    const result = await createUpdaterManifest(directory, "0.1.22", repository, "更新说明");
    assert.equal(result.notes, "更新说明");
    assert.equal(result.platforms["windows-x86_64-nsis"].url, prefix + "Pet_0.1.22_x64-setup.exe");
    assert.equal(result.platforms["windows-x86_64-msi"].url, prefix + "Pet_0.1.22_x64_en-US.msi");
    assert.deepEqual(result.platforms["windows-x86_64"], result.platforms["windows-x86_64-nsis"]);
    await rm(path.join(directory, "Pet_0.1.22_x64_en-US.msi.sig"));
    await assert.rejects(createUpdaterManifest(directory, "0.1.22", repository));
    await assert.rejects(createUpdaterManifest(directory, "0.1.22-beta", repository));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function setup(manifest: unknown, signed = true) {
  const writes: Record<string, any> = {};
  const assets = [{ name: "Pet_0.1.22_x64-setup.exe", state: "uploaded", browser_download_url: prefix + "Pet_0.1.22_x64-setup.exe" }];
  if (signed) assets.push({ name: "updater.json", state: "uploaded", browser_download_url: prefix + "updater.json" });
  const github = { rest: { repos: {
    async getLatestRelease() { return { data: { tag_name: "v0.1.22", assets } }; },
    async getContent() { throw Object.assign(new Error("不存在"), { status: 404 }); },
    async createOrUpdateFileContents(input: any) { writes[input.path] = JSON.parse(Buffer.from(input.content, "base64").toString()); },
  } } };
  const context = { repo: { owner: "example", repo: "pet" }, payload: { repository: { default_branch: "main" } } };
  return { writes, run: () => syncMetadata({ github, context, fetcher: async () => new Response(JSON.stringify(manifest)) }) };
}

test("发布同步读取最新 Release，并发布签名清单和手动更新信息", async () => {
  const manifest = { version: "0.1.22", platforms: { "windows-x86_64": { signature, url: prefix + "Pet_0.1.22_x64-setup.exe" } } };
  const { writes, run } = setup(manifest);
  await run();
  assert.deepEqual(writes["updates/updater.json"], manifest);
  assert.equal(writes["updates/latest.json"].tag_name, "v0.1.22");
});

test("发布同步拒绝版本不匹配、非法签名及非本次 Release 的安装包", async () => {
  for (const item of [
    { version: "0.1.21", url: prefix + "Pet_0.1.22_x64-setup.exe", signature },
    { version: "0.1.22", url: "https://untrusted.example/malware.exe", signature },
    { version: "0.1.22", url: prefix + "missing.exe", signature },
    { version: "0.1.22", url: prefix + "Pet_0.1.22_x64-setup.exe", signature: "invalid" },
  ]) {
    const { writes, run } = setup({ version: item.version, platforms: { "windows-x86_64": { url: item.url, signature: item.signature } } });
    await assert.rejects(run());
    assert.deepEqual(writes, {});
  }
});

test("最新 Release 没有签名包时清除旧自动更新信息，保留手动更新", async () => {
  const { writes, run } = setup(null, false);
  await run();
  assert.deepEqual(writes["updates/updater.json"], { version: "0.1.22", platforms: {} });
  assert.equal(writes["updates/latest.json"].tag_name, "v0.1.22");
});
