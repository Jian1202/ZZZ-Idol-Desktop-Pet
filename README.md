<div align="center">

# 妄想天使桌宠

**ZZZ Idol Desktop Pet**

让爱芮、南宫、千夏住进你的桌面，陪你互动、漫步与专注。

[下载安装](#下载安装) · [使用指南](#使用指南) · [反馈问题](https://github.com/Jian1202/ZZZ-Idol-Desktop-Pet/issues)

[![Releases 附件累计下载次数](https://img.shields.io/github/downloads/Jian1202/ZZZ-Idol-Desktop-Pet/total.svg?style=flat-square&label=total%20downloads)](https://github.com/Jian1202/ZZZ-Idol-Desktop-Pet/releases)
[![最新版附件下载次数](https://img.shields.io/github/downloads/Jian1202/ZZZ-Idol-Desktop-Pet/latest/total.svg?style=flat-square&label=latest%20downloads)](https://github.com/Jian1202/ZZZ-Idol-Desktop-Pet/releases/latest)

</div>

<p align="center">
  <img src="assets/readme/hero.webp" width="100%" alt="妄想天使桌宠：爱芮、南宫、千夏的真实角色渲染展示">
</p>

本仓库是 [HanaAyane 原项目](https://github.com/HanaAyane/ZZZ-Idol-Desktop-Pet) 的 fork，提供独立发布的 Windows 安装包。

## 桌面上的三位伙伴

- **一起陪伴** — 三位角色可同时显示，分别调节大小，也能单独隐藏。
- **自然互动** — 点击、双击、拖拽都有反馈，视线跟随鼠标，支持集合与散开。
- **自由漫步** — 横向、斜向六个方向移动，频率和速度随你调整。
- **窗口托举** — 将角色拖到普通窗口底边，让她们贴边托举；也可开启漫步时自动托举。
- **专注陪伴** — 番茄钟与自定义计时两种模式，支持不等间隔提醒、暂停与继续，关闭窗口后仍在后台计时。

- **活动室** — 新增独立活动室、家具互动与日夜背景，非坐姿角色支持点击互动。
- **更新检查** — 在设置页手动检查本 fork 的最新正式版本，点击链接下载安装。

## 实际效果

<p align="center">
  <strong>专注陪伴 · 独立番茄钟</strong><br>
  <a href="assets/readme/pomodoro.webp"><img src="assets/readme/pomodoro.webp" width="800" alt="macOS 桌面上的三位桌宠与独立番茄钟，计时窗口显示 25 分钟专注时间"></a>
</p>

<p align="center">
  <strong>一起托举 · 三人贴边互动</strong><br>
  <a href="assets/readme/window-lift.webp"><img src="assets/readme/window-lift.webp" width="800" alt="爱芮、南宫、千夏同时在同一个窗口底边做托举动作"></a>
</p>

## 下载安装

顶部徽章自动显示所有 Releases 附件的累计下载次数与最新正式版的附件下载次数，更新有缓存延迟。统计包含 DMG、EXE、MSI 等上传附件；重复下载会累计，不代表独立用户数，也不包含 GitHub 自动生成的源码 ZIP/TAR 下载。

本 fork 的 Windows 最新正式版为 **v0.1.22**，新增 Windows 一键更新：显示版本与更新说明，下载并验证签名后安装重启，保留手动下载入口。[查看更新说明](https://github.com/Jian1202/ZZZ-Idol-Desktop-Pet/releases/tag/v0.1.22)。

| 系统 | 下载 | 安装方式 |
| :--- | :--- | :--- |
| Windows · x64（本 fork） | [下载 v0.1.22 EXE](https://github.com/Jian1202/ZZZ-Idol-Desktop-Pet/releases/download/v0.1.22/ZZZ.Idol.Desktop.Pet_0.1.22_x64-setup.exe) | 运行安装向导；[MSI 可选](https://github.com/Jian1202/ZZZ-Idol-Desktop-Pet/releases/download/v0.1.22/ZZZ.Idol.Desktop.Pet_0.1.22_x64_en-US.msi) |
| macOS · Apple Silicon（原作者版本） | [下载上游 v0.1.1 DMG](https://github.com/HanaAyane/ZZZ-Idol-Desktop-Pet/releases/download/v0.1.1/ZZZ-Idol-Desktop-Pet_0.1.1_aarch64.dmg) | 打开后将应用拖入「应用程序」；不包含本 fork v0.1.22 的新增功能 |

macOS 暂无 Intel 安装包，首次打开可能被系统拦截，请查看 [原作者 macOS 安装说明](https://github.com/HanaAyane/ZZZ-Idol-Desktop-Pet/releases/tag/v0.1.1)。本次发布仅提供 Windows x64。

本 fork 安装包的「检查更新」查询 [本仓库正式 Release](https://github.com/Jian1202/ZZZ-Idol-Desktop-Pet/releases)；API 限流时自动使用由发布工作流同步的备用版本信息。Windows 从 v0.1.22 开始支持「一键更新并重启」，下载成功并验证签名后才会启动安装器；首次从旧版升级至 v0.1.22 仍需手动安装。网络或签名检查失败时可改用手动下载。两边安装包沿用相同应用标识，会作为同一应用升级并共用配置，不支持独立并排安装。旧 CI 测试包的版本号可能高于 0.1.22，迁移方式见本版更新说明。

Release 随附 `SHA256SUMS.txt`、`BUILD-INFO.txt` 和 Windows 实机验收清单，可核对下载完整性与源码来源。

## 修复与上游进展

- 最新正式安装包仍为 v0.1.22。main 中的 7ceac3e 已修复安装前计时持久化错误未阻止安装、设置保存失败后重试丢失待保存内容两处问题，尚未发布到正式安装包。
- [修复构建](https://github.com/Jian1202/ZZZ-Idol-Desktop-Pet/actions/runs/41304394390) 已通过 164 项前端测试、41 项 Rust 测试及 Windows EXE/MSI 打包；CI 测试包的版本号不代表正式发布版本。
- 上游活动室入口 [#3](https://github.com/HanaAyane/ZZZ-Idol-Desktop-Pet/pull/3) 与限流修复 [#5](https://github.com/HanaAyane/ZZZ-Idol-Desktop-Pet/pull/5) 已合并。一键更新 [#7](https://github.com/HanaAyane/ZZZ-Idol-Desktop-Pet/pull/7) 为可评审 PR，作者已确认上述两处修复通过。
- 作者另发现连续修改设置时，旧失败请求可能覆盖新成功值的并发边界问题，并接手补充修复；本 fork 尚未包含该后续修复。上游将与前端 PR #8 整合并完成真实跨版本下载、安装与重启验收后安排发布。

## 使用指南

1. **启动应用**，三位角色会出现在桌面上。拖动角色即可调整位置。
2. **右键角色或打开系统托盘菜单**，进入设置，调整显示、大小、置顶和互动选项。
3. **按喜好开启漫步与托举**；开启「手动窗口托举」后，将角色拖到普通窗口底边附近松手，拖离或按 `Esc` 可放下。
4. **打开番茄钟**，从设置或菜单进入。默认每组 2 轮，专注 25 分钟、休息 5 分钟，开始前可自行调整。
5. **需要按自己的节奏提醒时**，切换到「自定义计时」，设置总时长和多个提醒点。例如计时 120 分钟，在第 25、45、90 分钟分别提醒。

6. **打开活动室**，可从角色右键菜单或托盘菜单直接进入，也可在设置页打开；体验家具互动和日夜背景；非坐姿角色可继续进行点击互动。
7. **检查软件更新**，在设置页点击「检查更新」，发现签名新版后点击「一键更新并重启」；也可前往本 fork 的 Release 手动下载。

设置快捷键：macOS `⌘ ,` / Windows `Ctrl + ,`。番茄钟关闭窗口后继续计时；退出并重启应用后，进度恢复为暂停，点击继续即可。

遇到问题时，可在设置中导出诊断报告，并附上系统版本、复现步骤与截图提交 [Issue](https://github.com/Jian1202/ZZZ-Idol-Desktop-Pet/issues)。

<details>
<summary><strong>开发与构建</strong></summary>

基于 Tauri 2、TypeScript、Rust 与 Spine Runtime。需要 Node.js 22、Rust stable 和目标平台的 Tauri 构建依赖；macOS 需要 Xcode Command Line Tools。

```bash
git clone https://github.com/Jian1202/ZZZ-Idol-Desktop-Pet.git
cd ZZZ-Idol-Desktop-Pet/desktop-pet
npm ci
npm run tauri -- dev
```

校验与构建：

```bash
npm run validate:windows-prep
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib
```

macOS 应用打包：

```bash
npm run tauri -- build --bundles app -- --locked
```

产物位于 `desktop-pet/src-tauri/target/release/bundle/macos/`。Windows x64 的 NSIS / MSI 由 [GitHub Actions](https://github.com/Jian1202/ZZZ-Idol-Desktop-Pet/actions/workflows/windows-build.yml) 构建。

[完整功能与开发说明](desktop-pet/README.md) · [Windows 实机验收清单](WINDOWS-TESTING.md)

</details>

## 版权与声明

本项目是非官方、非商业的个人同人衍生项目，与米哈游、HoYoverse、《绝区零》及相关官方活动不存在隶属、合作、赞助或背书关系。

爱芮、南宫、千夏的角色形象、动画及相关原始素材来源于《绝区零》相关官方活动，其知识产权归米哈游及其他相关权利人所有。本项目不主张拥有这些原始素材的版权；素材整理、动作适配和桌宠功能开发不改变原始素材的权利归属，也不代表获得官方授权。

本项目仅用于个人学习、非商业展示与技术研究。不得将含有上述素材的桌宠安装包、角色动画或宣传图出售、商业授权或打包销售，不得移除来源和版权说明，也不得用于暗示官方关联的用途。

本仓库不对第三方素材及其衍生内容授予通用再授权；Spine Runtime 等第三方运行库仍遵循各自的许可与使用条件。如权利人对仓库内容有异议，请通过 [Issue](https://github.com/Jian1202/ZZZ-Idol-Desktop-Pet/issues) 提出移除或调整请求。
