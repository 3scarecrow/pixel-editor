# 点修 · 静态部署准备

当前方案为 Next.js 静态导出，不需要生产 Node.js 服务、数据库或图片上传接口。部署平台已选择 Cloudflare Pages Git 集成，使用平台提供的 pages.dev 地址。Git 仓库指定为 https://github.com/3scarecrow/pixel-editor，本地已设置 origin；远程仓库是否已创建尚无法确认，当前 GitHub 授权失败。本轮只准备发布资料，尚未上线。

## 发布产物

在项目根目录使用 Node.js 22.16.0：

```sh
npm ci
npm run build
python3 scripts/package-release.py
```

发布包：releases/dianxiu-0.1.0-static.zip。校验与逐文件清单：releases/dianxiu-0.1.0-manifest.json。ZIP 根目录为 out/ 内的网站文件；不包含源码、node_modules、验证工程或测试截图。每次改动后重新构建、打包，避免上传旧产物。

## 通用部署要求

- 上传或解压整个发布包，保留 _next/、editor/ 与 Next.js 生成的所有 .txt 文件。
- 部署在域名根路径，通过 HTTPS 提供访问。
- / 对应 index.html；/editor/ 对应 editor/index.html，支持直接访问与刷新。
- 不添加将所有路径重写到首页的 SPA 回退规则；未知路径返回 404。
- Worker 和 JavaScript 资源必须正确返回，不能被 HTML 回退覆盖。启用服务器标准 MIME 映射（Nginx 的 mime.types）。
- HTML 和 RSC 文本文件使用 no-cache，_next/static/ 哈希资源使用长期 immutable 缓存。
- 一次发布整个目录；使用新版本目录和原子切换，保留上一版本以便回滚。

## 自有服务器示例

deploy/nginx.conf.example 给出站点路径、路由与缓存规则，未配置真实域名或 TLS。将发布包解压到新的版本目录，核对权限和 MIME 配置；由服务器管理员将 /srv/dianxiu/current 指向该版本。启用前运行 nginx -t，再重载配置。若直接对外提供服务，应补齐真实域名、TLS 证书、HTTPS 监听与 HTTP 跳转；若已有 HTTPS 代理，配置正确的代理目标。不要覆盖未知的现有站点配置。

Cloudflare Pages / Vercel 等平台可托管 out/，但平台专用配置将在平台确定后补齐，不将该 Nginx 示例用于这些平台。

## 上线验收

1. HTTPS 首页、编辑器直达、刷新和 404 正常。
2. PNG 导入、修改、下载与动画帧 ZIP 正常，Worker 请求无报错。
3. 有未导出修改时，Logo 返回首页、浏览器后退和刷新提示确认；取消保留修改。
4. 检查无上传图片的网络请求，静态资源缓存正常。
5. Safari 与 Edge 实机验收仍未完成，不宣称已覆盖所有目标浏览器。

确认后再绑定正式域名并开放访问。项目仍为会话内编辑，不支持自动恢复；浏览器对 beforeunload 原生确认存在限制，不能代替保存或导出。

## Cloudflare Pages Git 集成（选定方案）

1. 将项目作为独立仓库推送到 GitHub/GitLab，保留 package-lock.json、.nvmrc 与 public/_headers。不要上传 node_modules、out、测试截图、验证工程或环境密钥。
2. Cloudflare 控制台 → Workers & Pages → Create application → Pages → Import an existing Git repository。授权 Git 提供商，只勾选本项目仓库。
3. 设置如下：

| 配置 | 值 |
| --- | --- |
| 项目名 | pixel-editor（若不可用则选择其他名字） |
| 生产分支 | main |
| Framework preset | Next.js (Static HTML Export) |
| 构建命令 | npm run build |
| 构建输出目录 | out |
| 根目录 | 独立仓库留空；若仓库含多个项目则填 pixel-editor |
| 环境变量（Production / Preview） | NODE_VERSION = 22.16.0 |

当前没有 API 密钥或运行时环境变量。不要使用需要服务端适配器的普通 Next.js preset；本项目已设置 output: export，也不需要 next-on-pages。

4. Save and Deploy。成功后记录真实 pages.dev 地址，完成线上验收；不要把示例地址当成实际部署地址。
5. 后续 push 到 main 自动构建部署；其他分支可生成预览。保留平台部署记录，用于失败时回滚。

_headers 随 Next.js public/ 复制进 out/，提供基础响应头及哈希资源缓存。路由由 Pages 的静态文件服务处理，不添加全站 SPA 回退。

官方依据（2026-10-08 核对）：
- https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/
- https://developers.cloudflare.com/pages/get-started/git-integration/

## 当前连接状态

指定账号：3scarecrow，仓库：pixel-editor，远程地址：https://github.com/3scarecrow/pixel-editor.git。GitHub HTTPS 访问返回 Invalid username or token，尚未推送或创建 Cloudflare 项目。Cloudflare 项目名称使用 pixel-editor，实际 pages.dev 地址以成功部署结果为准。

恢复 GitHub 本机授权并确认空仓库已创建后，可在项目目录执行 `git push -u origin main`。本轮不重置 Keychain 中已有凭据，不要求用户提供明文 Token。随后在 Cloudflare 授权该仓库，采用上面的静态构建配置。
