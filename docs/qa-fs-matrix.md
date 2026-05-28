# 跨端文件系统验证矩阵

按 `L1 dialog+fs → L2 FSAA → L3 android-fs（仅 Android）→ L4 input → L5 托管 → L6 不支持` 记录每层命中。

## 选取（pickFile）

| 平台 | 预期主路径 | 验证项 |
|------|------------|--------|
| Windows Tauri | L1 | 单文件 `.epub`/`.txt`；禁用 dialog 后应落 L2 |
| Android Tauri | L1 | `content://` + fs 读取；L1/L2 失败时 L3 SAF |
| iOS Tauri | L1 → L2 | 无 L3 |
| Chrome Web | L2 → L4 | 无 L1/L3 |

## 目录（pickDirectory）

| 平台 | 预期主路径 | 验证项 |
|------|------------|--------|
| Windows Tauri | L1 | `booksStorageRoot` 为 `path:` |
| Android Tauri | L2 或 L3 | 勿用 `directory: true` 的 L1 |
| iOS | L2 → L4 → L5 | |
| Web | L2 / L5 | |

## 读写与书架

- [ ] 导入后 `bookUrl` 为 `path:` 或 `opfs:`（物化）
- [ ] 阅读章节 `readLocalBookContent` 正常
- [ ] 删书、重启后 StorageRef 仍可读
- [ ] 批量导入页 `listDirectory` 对 `path:` / `saf-tree:` / `dir-handle:` 可浏览

## 日志

控制台筛选 `[fs-bridge]`，确认 `attempted` 与 `winner` 符合上表。
