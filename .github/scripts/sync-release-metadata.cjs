// 只同步已经公开的最新正式版，并校验签名清单里的仓库、版本和附件。
module.exports = async ({ github, context, fetcher = fetch }) => {
  const repo = context.repo;
  const branch = context.payload.repository.default_branch;
  let release;
  try {
    release = (await github.rest.repos.getLatestRelease(repo)).data;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const tag = release?.tag_name || "";
  const version = tag.replace(/^[vV]/, "");
  const asset = release?.assets.find(item => item.name === "updater.json" && item.state === "uploaded");
  let updater = { version: version || "0.0.0", platforms: {} };
  if (asset) {
    const response = await fetcher(asset.browser_download_url);
    if (!response.ok) throw new Error("读取正式版签名清单失败");
    updater = await response.json();
    if (updater.version !== version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("签名清单版本不一致");
    const platforms = Object.entries(updater.platforms || {});
    if (!platforms.length) throw new Error("签名清单缺少平台信息");
    const prefix = `https://github.com/${repo.owner}/${repo.repo}/releases/download/${encodeURIComponent(tag)}/`;
    for (const [platform, item] of platforms) {
      if (!["windows-x86_64", "windows-x86_64-nsis", "windows-x86_64-msi"].includes(platform)
        || typeof item.url !== "string" || !item.url.startsWith(prefix)
        || typeof item.signature !== "string" || !/^[A-Za-z0-9+/=]+$/.test(item.signature)
        || !Buffer.from(item.signature, "base64").toString("utf8").startsWith("untrusted comment:")
        || !release.assets.some(file => file.browser_download_url === item.url && file.state === "uploaded")) {
        throw new Error("签名清单包含无效平台或仓库外附件");
      }
    }
  }
  async function save(path, value) {
    const text = JSON.stringify(value, null, 2) + "\n";
    let sha;
    try {
      const { data } = await github.rest.repos.getContent({ ...repo, path, ref: branch });
      if (Buffer.from(data.content, "base64").toString("utf8") === text) return;
      sha = data.sha;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    await github.rest.repos.createOrUpdateFileContents({ ...repo, path, branch, sha,
      message: `同步正式版更新信息：${tag || "暂无正式版"}`,
      content: Buffer.from(text).toString("base64") });
  }
  await save("updates/updater.json", updater);
  await save("updates/latest.json", { tag_name: tag, draft: false, prerelease: false });
};
