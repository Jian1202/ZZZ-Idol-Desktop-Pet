import assert from "node:assert/strict";
import test from "node:test";
import { installVerifiedUpdate, type InstallableUpdate, type InstallProgress } from "../src/settings/oneClickUpdate.ts";

test("签名验证完成后保存状态，再启动安装并要求重启", async () => {
  const order: string[] = [];
  const progress: InstallProgress[] = [];
  const update: InstallableUpdate = {
    version: "0.1.23",
    async download(onEvent, options) {
      assert.equal(options?.timeout, 300_000);
      onEvent?.({ event: "Started", data: { contentLength: 10 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 4 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 6 } });
      onEvent?.({ event: "Finished" });
      order.push("签名已验证");
    },
    async install(options) { assert.equal(options?.restartAfterInstall, true); order.push("安装"); },
    async close() {},
  };
  await installVerifiedUpdate(update, async () => { order.push("保存状态"); }, p => progress.push(p));
  assert.deepEqual(order, ["签名已验证", "保存状态", "安装"]);
  assert.equal(progress.at(-1)?.phase, "installing");
  assert.equal(progress.at(-1)?.downloaded, 10);
  assert.equal(progress.at(-1)?.total, 10);
});

test("下载或签名验证失败时不执行保存和安装，保存失败时不安装", async () => {
  for (const failure of ["下载失败", "签名无效", "保存失败"]) {
    let installed = false;
    let prepared = false;
    const update: InstallableUpdate = {
      version: "0.1.23",
      async download() { if (failure !== "保存失败") throw new Error(failure); },
      async install() { installed = true; },
      async close() {},
    };
    await assert.rejects(installVerifiedUpdate(update, async () => {
      prepared = true;
      throw new Error(failure);
    }, () => {}), new RegExp(failure));
    assert.equal(installed, false);
    assert.equal(prepared, failure === "保存失败");
  }
});

test("服务器未提供包大小时仍能报告已下载字节", async () => {
  const progress: InstallProgress[] = [];
  await installVerifiedUpdate({ version: "0.1.23", async download(onEvent) {
    onEvent?.({ event: "Started", data: {} });
    onEvent?.({ event: "Progress", data: { chunkLength: 1234 } });
  }, async install() {}, async close() {} }, async () => {}, p => progress.push(p));
  assert.equal(progress.at(-1)?.downloaded, 1234);
  assert.equal(progress.at(-1)?.total, undefined);
});
