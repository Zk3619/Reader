# Tauri + Solid + Typescript

This template should help get you started developing with Tauri, Solid and Typescript in Vite.

## 纯 Web：打包并托管 `dist`（含书源 HTTP 代理）

浏览器里 **不能** 用 `file://` 直接打开 `dist/index.html`（ES Module 会被 CORS 拦截）。  
纯 Web 模式下书源请求需要同源 **`/__reader_http`** 代理（实现在 `vite-plugins/reader-http-proxy.ts`），该逻辑 **不在** `dist` 里，而是由 **Node 服务** 在 dev / preview 时挂载。

| 阶段 | 命令 | 说明 |
|------|------|------|
| 开发 | `pnpm dev` | http://localhost:1420，热更新 + 代理 |
| 打包前端 | `pnpm build:web` | 将 `src/` 编译到 `dist/` |
| 托管 dist + 代理 | `pnpm start:web` | `vite preview`，默认 http://localhost:4173 |

```bash
cd Reader
pnpm build:web
pnpm start:web
```

在浏览器访问终端打印的 Local / Network 地址即可（不要用资源管理器双击 `index.html`）。

**架构简述**

```text
浏览器  →  http://host:4173/          →  dist 静态资源（index.html、assets、wasm）
         →  http://host:4173/__reader_http?target=…  →  reader-http-proxy 中间件 → 书源站点
```

Tauri 桌面版走 `pnpm tauri dev` / `tauri build`，由 Rust WebView + 原生 HTTP 处理，不依赖上述 Node 代理。

若代理与静态站分离部署（进阶），可在 **构建时** 指定外部代理根路径，例如  
`VITE_WEB_HTTP_PROXY=https://your-api.example.com/__reader_http pnpm build:web`（需自行部署实现相同路由的后端）。

## `src/` 目录约定

| 路径 | 用途 |
|------|------|
| `app/` | 应用根组件与全局样式（`App.tsx`、`App.css`） |
| `pages/` | 路由级页面入口 |
| `components/ui/` | 通用 UI 基元（shadcn/kobalte） |
| `components/shell/` | 壳层：导航、侧栏、工具栏、窗口控件等 |
| `components/shared/` | 跨页面共享组件（对话框、Toast、图标） |
| `components/bookshelf/`、`sources/`、`books/`、`remote-book/` | 按功能域划分的业务组件 |
| `lib/` | 领域逻辑（`database`、`book-source`、`js-engine`、`platform` 等） |
| `lib/bookshelf/` | 书架布局/排序等 UI 辅助逻辑（自 `utils/` 迁入） |
| `stores/` | Solid 全局状态 |
| `types/` | 类型定义 |
| `utils/` | 通用工具（无障碍、窗口状态等，与具体页面无关） |

导入统一使用 `@/` 别名（见 `tsconfig.json`），勿使用 `src/`、`~/` 或跨目录相对路径。

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 提交到 GitHub

1. **在 GitHub 上新建仓库**  
   打开 [GitHub New Repository](https://github.com/new)，填写仓库名（如 `Reader`），选择 Public/Private，**不要**勾选 “Add a README”等初始化选项（本地已有项目）。

2. **本地初始化并关联远程**（若尚未初始化 Git）：
   ```bash
   cd /d/Projects/Rust/Reader
   git init
   git add .
   git commit -m "Initial commit: Reader (Tauri + Solid)"
   git branch -M main
   git remote add origin https://github.com/你的用户名/Reader.git
   git push -u origin main
   ```

3. **若项目已是 Git 仓库**，只需添加远程并推送：
   ```bash
   git remote add origin https://github.com/你的用户名/Reader.git
   git branch -M main   # 若当前分支不是 main 可先改名为 main
   git push -u origin main
   ```

4. **使用 SSH 推送**（若已配置 SSH key）：
   ```bash
   git remote add origin git@github.com:你的用户名/Reader.git
   git push -u origin main
   ```

将上述 `你的用户名/Reader` 替换为你的 GitHub 用户名和仓库名。
