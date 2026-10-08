# 点修

用于手动修正 AI 生成像素图片中的错误像素，默认编辑单张或多张独立图片；主动启用动画模式后支持逐帧编辑与预览。

技术方案：Next.js + TypeScript、客户端编辑核心、Canvas 2D、Web Worker。

当前阶段：首期功能已实现，包含独立图片编辑、主动动画模式、自研 Canvas 2D 与 Worker 导入导出。

## 文档

- [需求说明](docs/01-requirements.md)：首期范围、交互流程与验收标准。
- [架构设计](docs/02-architecture.md)：技术方案、模块边界、数据模型与关键算法。
- [实施与验证计划](docs/03-implementation-plan.md)：开发顺序、测试策略和风险处理。
- [开源复用评估](docs/04-open-source-evaluation.md)：现成编辑器与组件候选，以及复用验证条件。
- [Dotting 验证报告](docs/05-dotting-validation.md)：实测结果、性能数据及选型建议。
- [开发验收记录](docs/06-development-validation.md)：实现范围、测试结果和发布前待办。

首期采用浏览器本地处理方案，图片无需上传服务器。在线指通过网页使用；首次加载依赖网络，离线使用不属于首期承诺。

## UI 设计

- [设计说明](design/ui-design-notes.md)
- [图片编辑模式](design/dianxiu-images-ui-v2.png)
- [动画编辑模式](design/dianxiu-animation-ui-v2.png)

## 本地运行

Node.js 22.16.0（或满足当前 Next.js 的 Node 版本），Python 3 用于静态预览。

```sh
npm ci
npm run dev
```

访问 http://127.0.0.1:3000/editor/。开发服务器只监听本机。

生产构建和静态预览：

```sh
npm run build
npm start
```

`npm start` 通过 Python 在本机 3000 端口提供 `out/` 静态产物；静态部署时上传整个 `out/`，包含 Worker 与 `_next` 资源。开发与预览不要同时占用 3000。

## 验证

```sh
npm test
npm run typecheck
npm run build
npx playwright install
npm run test:e2e
```

端到端测试自动启动或复用 3102 静态服务，须先构建。macOS 优先使用本机 Chrome；可通过 `CHROME_PATH` 指定路径，其他平台使用 Playwright Chromium。测试驱动锁定 1.56.1，以适配当前 macOS；WebKit 结果是引擎验证，不能等同于最新 Safari 实机测试。

快捷键：B 画笔、I 吸管、E 橡皮擦、H 平移；⌘/Ctrl Z 撤销，⌘/Ctrl Shift Z 或 ⌘/Ctrl Y 重做。画布滚轮缩放，空格拖动或鼠标中键平移。

支持静态 PNG（含低位深灰度/索引色、Adam7），不支持 16 位或 APNG 输入。图片宽高各不超过 1024、最多 100 张、总像素不超过 1600 万，单批次文件不超过 50 MiB。

关闭页面后图片、历史和动画设置不会自动保存；请导出需要保留的 PNG。动画模式目前导出独立帧 ZIP，不导出 GIF/APNG。只在用户主动选择动画时启用预览。

实际运行截图与演示 PNG 在 `artifacts/`，测试与实现状态见 [开发验收记录](docs/06-development-validation.md)。第三方许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 部署准备

执行 `npm run build` 后运行 `python3 scripts/package-release.py`，生成 `releases/` 下的静态发布包与 SHA-256 清单。详见 [部署说明](docs/08-deployment.md)。当前尚未上线；平台与域名待确定。

## 界面语言

首页和编辑器支持中文、英文，通过首页导航栏的语言下拉框选择 `English` / `中文`。首次访问按浏览器语言选择（中文浏览器使用中文，其余使用英文），手动选择保存在本机浏览器中。编辑器继承首页的语言选择，不显示语言切换入口；页面刷新仍遵循原有的不自动保存规则。文案集中在 `src/i18n/en.json`，不需要新增运行时依赖。当前采用同一地址切换界面语言，尚未提供独立英文 SEO 页面。
