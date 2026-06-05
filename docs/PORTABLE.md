# Reader 便携版 / 单文件打包说明

本项目使用 Tauri 2，默认会同时生成 **NSIS** 与 **MSI** 两种安装包（`tauri.conf.json` 中 `bundle.targets` 为 `"all"`），用于正常分发给用户；便携版通过解压 NSIS 得到。

**重要区分**：  
- **NSIS 的 `.exe` 是安装包**：若直接**运行**它，会执行安装、写入注册表、在系统「添加或删除程序」里注册卸载程序。  
- **便携版**：**不要运行**该安装包，而是用 7-Zip **打开并解压**它；解压出来的文件夹才是便携版，直接运行其中的 `reader.exe`，不会安装、也不会注册卸载程序。

## 一、构建

在项目根目录执行：

```bash
npm run tauri build
```

产物位置：

- **NSIS 安装包**：`src-tauri/target/release/bundle/nsis/reader_0.1.0_x64-setup.exe`（也可用 7z 解压得到便携版）
- **MSI 安装包**：`src-tauri/target/release/bundle/msi/reader_0.1.0_x64_*.msi`

## 二、得到便携版（免安装文件夹）

**不要运行** `reader_0.1.0_x64-setup.exe`（运行就会变成正常安装并注册卸载）。用 7-Zip **当作压缩包解压**即可得到免安装的便携版：

1. 安装 [7-Zip](https://www.7-zip.org/)（若未安装）。
2. **右键** `reader_0.1.0_x64-setup.exe` → **7-Zip** → **打开压缩包**（不要双击运行）。
3. 将压缩包内文件**解压到任意文件夹**（例如 `Reader便携版`）。
4. 该文件夹即为**便携版**：内含 `reader.exe` 及依赖，直接运行 `reader.exe`，**不会**写入注册表、**不会**在系统里注册卸载程序。可将整个文件夹复制到 U 盘或其它电脑使用。

### config.json 与数据目录（桌面绿色版）

程序启动时会在 **`exe/AppData/`** 创建 **`config.json`**（若不存在），用于统一存放：
- **数据路径**（如 `dataDir`，对应数据库、本地书籍、缓存等）；
- **应用设置**（书架布局、WebDAV 等）与 `dataDir` 均保存在同一 `config.json` 中；程序仅使用 `config.json`，不再支持旧版 `settings.json`。

桌面端默认目录布局：

| 内容 | 默认路径 |
|------|----------|
| 配置、窗口状态、数据库与业务缓存 | `AppData/`（含 `config.json`、`.window-state.json`、`reader.db` 等） |
| plugin-http Cookie 仓 | `AppData/.cookies`（启动时桥接到系统缓存目录） |
| WebView2（localStorage、Cookies） | `EBWebView/`（与 exe 同级；可在设置中改 `webviewDataDir`） |
| 运行日志 | `logs/`（按天轮转，保留 7 份） |

首次从旧版升级时，程序会自动将 exe 根目录下的 `config.json`、`.window-state.json` 以及 `WebViewCache/*/EBWebView` 迁入上述新位置。

`config.json` 中可通过 **`dataDir`** 指定数据根目录：

- 不设或为空：使用 exe 旁的 **`AppData`**。
- 设为相对路径：相对 **exe 目录** 解析。
- 设为绝对路径：直接使用该路径。

可选：在 exe 同目录放置 **`reader.json`**，用其中的 **`dataDir`** 覆盖默认 `AppData`（无需其它标记文件）。

应用内**设置 → 存储与 WebView** 可更改数据目录；**从旧版目录迁移** 可从 `%APPDATA%\com.zkingz.reader` 自动导入数据库与缓存。

在设置中**更改程序数据目录**并重启后：
1. **更改前**：设置页会预检原目录大小与目标磁盘剩余空间。
2. **重启时**：先弹出「数据迁移」进度窗口（非后台静默），复制 `reader.db`（含 `-wal`/`-shm`）、`cover-cache`、`book-cache`。
3. **事务性**：全量复制完成后在新目录写入 `.migration_complete_v1` 标记；**不自动删除**原目录，备份路径记在 `dataDirMigrationBackup`，可在设置中手动清理。
4. **失败时**：可重试或「恢复原目录并启动」。

**WebView 目录**变更不迁移缓存（易出错），重启后 WebView 数据重新生成，书源可能需重新登录。

### 从安装版迁移到便携版

1. **推荐**：保留旧目录不动，直接运行便携版 exe，程序会**自动**从 `%APPDATA%\com.zkingz.reader` 复制 `reader.db`（及 `-wal`/`-shm`）、`cover-cache`、`book-cache` 到 `exe\AppData\`。
2. 若已手动复制文件，请确保：
   - 数据库在 **`exe\AppData\reader.db`**（不是 exe 根目录）
   - 同时复制 **`reader.db-wal`**、**`reader.db-shm`**（若存在）
   - **不要**在 `exe\AppData\config.json` 里保留指向旧 `%APPDATA%` 的绝对路径 `dataDir`（程序会自动清除）
3. 迁移后若书架仍空：设置 → 存储与 WebView → **从旧版目录迁移**，然后重启应用。

## 三、得到“单文件” exe（自解压）

若希望分发给用户的是**一个 exe**，可做成**自解压包**：

1. 先按「二」得到便携版文件夹。
2. 用 **7-Zip**：选中便携版文件夹内全部内容 → 右键 → 7-Zip → 添加到压缩包，格式选 **7z**，得到 `Reader.7z`。再使用 7-Zip 的“自解压”功能（或配合 7z.sfx）生成 exe。
3. 或用 **WinRAR**：选中便携版文件夹 → 右键 → 添加到压缩文件，勾选“创建自解压格式压缩文件(.exe)”。
4. 用户运行该 exe 时会先解压到临时目录再运行，实现“单文件”分发。

## 四、仅构建、不生成安装包（高级）

若只想得到 exe 和资源、不生成 NSIS 安装包，可跳过打包步骤：

```bash
npm run tauri build -- --no-bundle
```

- 可执行文件：`src-tauri/target/release/reader.exe`  
- 此时**不会**生成安装包，且 exe 依赖的 frontend 资源可能未自动复制到该目录。  
- 若需在此模式下直接运行 exe，需自行保证 `reader.exe` 能访问到 `dist` 等资源（或先做一次完整 `tauri build` 再手动从 `target/release` 取用）。  
- 一般推荐用「一 + 二」的方式得到便携版，再按需做自解压。

## 五、只生成其中一种安装包（可选）

若只需 NSIS 或只需 MSI 以缩短构建时间，可在 `src-tauri/tauri.conf.json` 中将 `"targets": "all"` 改为 `"targets": ["nsis"]` 或 `"targets": ["msi"]`，然后重新执行 `npm run tauri build`。
