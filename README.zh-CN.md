# Codex Mate

[English](./README.md)

Codex Mate 是一个给 Codex 桌面应用使用的本地图像图库。它会索引 Codex Desktop 生成在你电脑上的图片，把图片和本地 session 元数据、prompt 关联起来，然后提供一个干净、私密的本地浏览界面。

![Codex Mate 截图](./docs/images/codex-mate-screenshot.png)

## 为什么做它

Codex Desktop 会在不同会话里生成很多有用的图片。Codex Mate 的目标是让这些本地图片更容易浏览、搜索、回看 prompt 和打开文件，同时不上传任何数据，也不依赖云服务。

## 隐私边界

- 完全本地运行。
- 不需要登录、API key、统计分析或遥测。
- 图库不需要网络连接。
- 只读取你电脑上的 Codex Desktop 本地数据。
- 默认把自己的 SQLite 索引放在 `~/.codex-mate`。

## Codex Desktop 数据目录

Codex Mate 是给 Codex 桌面应用做的 companion app，不是 Codex CLI 工具。默认读取：

```text
~/.codex/generated_images
~/.codex/session_index.jsonl
~/.codex/sessions
```

可以用环境变量覆盖路径：

```bash
CODEX_HOME=/path/to/codex-data
CODEX_MATE_HOME=/path/to/codex-mate-data
CODEX_MATE_DB=/path/to/codex-mate.sqlite
```

## 安装

```bash
npm install
```

## 开发模式

启动 Web UI 和 API：

```bash
npm run dev
```

默认开发地址：

- Web UI: `http://127.0.0.1:4388`
- API: `http://127.0.0.1:4389`

## 桌面应用

启动 Electron 桌面版：

```bash
npm run desktop
```

构建未签名的 macOS 安装包：

```bash
npm run package:mac
```

构建产物会输出到 `release/`。

## Web 生产模式

```bash
npm run build
npm start
```

## 测试

```bash
npm test
npm run build
```

## GitHub Actions

仓库已经配置：

- `CI`：push 和 pull request 时自动运行测试和生产构建。
- `Package macOS App`：手动触发时构建未签名的 macOS `.dmg` / `.zip`，推送 `v*` tag 时会创建 draft release。

## macOS Gatekeeper

当前公开构建是未签名版本。如果 macOS 阻止启动，可以右键 app 选择 **打开**，或者在 **系统设置 > 隐私与安全性** 中允许打开。

正式的签名和公证版本需要 Apple Developer 凭据，默认没有配置。

## License

MIT
