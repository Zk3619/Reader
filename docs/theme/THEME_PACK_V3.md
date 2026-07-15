# Reader Theme Pack v3 — 目标主题

v3 在 v1/v2 的 `app`、`viewer` 兼容结构上增加 `targets`，允许应用壳层、
业务模块和具体查看器同时使用不同主题预设。

## 主题目标

- `app`：应用壳层与通用控件。
- `module.reading`：阅读模块共享外壳。
- `viewer.text`、`viewer.image`、`viewer.audio`、`viewer.video`、`viewer.file`：
  各类阅读器。
- `module.music`：音乐 Hub。
- `music.playDetail`：音乐播放详情。
- `music.desktopLyric`：桌面歌词窗口。

## 继承

运行时按“精确目标 → 所属模块 → app → 内置默认”解析活动预设。
同一主题包内部也按父目标到子目标依次覆写，因此子目标只需声明差异。

```json
{
  "schemaVersion": 3,
  "targets": {
    "module.music": {
      "tokens": {
        "id": "music",
        "name": "音乐主题",
        "light": {},
        "dark": {},
        "layout": {}
      }
    },
    "music.playDetail": {
      "background": {
        "type": "gradient",
        "stops": [
          { "color": "#16213e", "at": "0%" },
          { "color": "#0f3460", "at": "100%" }
        ]
      }
    }
  }
}
```

实际 token 必须满足完整 `AppThemeDefinition`；示例省略了语义色字段。

## 兼容

- v1/v2 的 `app` 映射为 `app` 父目标。
- v1/v2 的 `viewer` 映射为 `module.reading`，并继续保留文本、图片、音频、
  视频和文件分区。
- 旧的 `activeThemePresetId`、`activeViewerThemePresetId` 在设置加载时迁移到
  `activeThemePresetByTarget`。
- 导入、删除保护、备份和质量门禁均同时识别旧作用域与 v3 目标。

## 隔离

每个运行时根节点使用 `data-theme-target` 和 `data-theme-pack-id`。目标主题的
CSS 变量及自定义 CSS 只注入该 DOM 子树；子主题不会污染应用壳层或其他模块。
