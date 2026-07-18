# 重命名清单：`music` → `audio`，`tv` → `video`

> **范围**：仅目录名 / 文件名，不手改代码内容（依赖 IDE Rename / 自动更新 import）。  
> **依据**：[SHELL_MODULE_MIGRATION.md](./SHELL_MODULE_MIGRATION.md) §3.0 决策 3。  
> **原则**：模块边界用宽语义 `audio` / `video`；历史迁移脚本、Java 包、误匹配名不改。

操作建议：

1. **先改最深目录，再改父目录**（或整棵子树一次 Move）。  
2. 目录改完后再批量改文件名（IDE Rename Symbol / Rename File）。  
3. 每改完一批跑 `pnpm test` 或至少 `pnpm build` 确认 import 已跟上。  
4. **不要**用全局文本替换硬改字符串（易伤到 `TextViewer*`、DB 历史域名等）。

---

## 0. 命名变换规则

| 模式 | 目标 |
|------|------|
| 路径段 `/music/`（模块页、hub、store） | `/audio/` |
| 路径段 `/tv/`（模块页、hub、lib） | `/video/` |
| 文件名前缀 `Music` | `Audio` |
| 文件名前缀 `Tv` | `Video` |
| 文件名片段 `music-` | `audio-` |
| 文件名片段 `tv-` | `video-` |
| `music-hub` | `audio-hub` |
| `tv-hub` | `video-hub` |

复合例：`MusicHubShell.tsx` → `AudioHubShell.tsx`；`AudioMusicHubView.tsx` → `AudioHubView.tsx`（去掉冗余 Music）。

---

## 1. 明确不要改（排除）

| 路径 / 名称 | 原因 |
|-------------|------|
| `**/text-viewer/**`、`TextViewer*` | 含 `tv` 子串但是**文本阅读器**，与视频模块无关 |
| `src/lib/database/migration-v106-music-*.ts` | 历史迁移文件名，改名无收益且易混淆版本溯源 |
| `src/lib/database/migration-v107-music-*.ts` | 同上 |
| `src/lib/database/migration-v108-tv.ts` | 同上 |
| `src/lib/database/migration-v109-music-playback.ts` | 同上（表/DAO 可另迁，**文件名建议保留**） |
| `tools/tv-jar-host/**` 内 Java 包名 `com.reader.tvjarhost` | 仅改目录不够，需改 package；单列后期 |
| DB 列/行里的历史值 `domain='music'` | 不是文件名；属数据迁移，不在本文 |

---

## 2. 目录重命名（优先做）

按「先子后父」或「整树移动」执行。

### 2.1 必做（模块边界）

| 当前 | 目标 |
|------|------|
| `src/pages/music/` | `src/pages/audio/` |
| `src/pages/tv/` | `src/pages/video/` |
| `src/stores/music-hub/` | `src/stores/audio-hub/` |
| `src/stores/tv-hub/` | `src/stores/video-hub/` |
| `src/components/viewer/audio/music/` | `src/components/viewer/audio/hub/` 或 `.../audio/app/`（见下） |
| `src/components/viewer/tv/` | `src/components/viewer/video/` |
| `src/lib/media/tv/` | `src/lib/media/video/` |

**关于 `components/viewer/audio/music/`**：  
父级已是 `audio/`，子目录再叫 `music/` 冗余。推荐二选一：

- **推荐 A**：`audio/music/` → `audio/hub/`（与内部 `hub/` 文件夹合并时注意层级）  
- **推荐 B**：保持一层 `audio/hub/`，把现有 `music/hub/*`、`music/settings/*` 提到 `audio/hub/`、`audio/settings/`  

建议目标结构：

```text
src/components/viewer/audio/
  hub/          ← 原 music/hub/
  settings/     ← 原 music/settings/
  AudioHubView.tsx 等 ← 原 music/ 根下文件
```

即：**删掉中间的 `music/` 目录名**，不要变成 `audio/music/...`。

### 2.2 建议做（SDK / 工具）

| 当前 | 目标 | 备注 |
|------|------|------|
| `src/lib/media/audio/music-sdk/` | `src/lib/media/audio/online-sdk/` 或 `audio-sdk/` | 源自 lx-music；若暂不想动协议层可 **本迭代跳过** |
| `tools/tv-jar-host/` | `tools/video-jar-host/` | 目录可先改；Java 包/类名另开任务 |

### 2.3 本轮不做

- `src/components/viewer/video/`（ArtPlayer 等已存在的通用视频播放器目录）— 与「影视模块 UI」合并时再规划，避免两套 `video` 语义撞车。  
  - 模块壳：`components/viewer/video/` ← 现 `tv/`  
  - 播放器：`components/viewer/video/artplayer` 等已在 `video/` 下时，迁 `tv/` 前先看冲突，必要时模块用 `video-hub/`。

**冲突检查**：当前已有 `src/components/viewer/video/`（如 `ArtPlayerStage.tsx`）。因此：

| 方案 | 做法 |
|------|------|
| **推荐** | `components/viewer/tv/` → `components/viewer/video-hub/`（或 `vod/`） |
| 备选 | 把现有 artplayer 挪到 `video/player/`，再把 `tv/` 整树并入 `video/` |

下文文件表按 **`tv` → `video-hub`**（组件层）/ **`lib/media/tv` → `lib/media/video`**（逻辑层）书写；若你合并进现有 `video/`，自行替换目标路径即可。

---

## 3. 文件重命名

### 3.1 页面

| 当前 | 目标 |
|------|------|
| `src/pages/music/MusicPage.tsx` | `src/pages/audio/AudioPage.tsx` |
| `src/pages/music/MusicSettingsPage.tsx` | `src/pages/audio/AudioSettingsPage.tsx` |
| `src/pages/tv/TvPage.tsx` | `src/pages/video/VideoPage.tsx` |
| `src/pages/tv/TvSettingsPage.tsx` | `src/pages/video/VideoSettingsPage.tsx` |
| `src/pages/sources/SourcesMusicSourcePanel.tsx` | `src/pages/sources/SourcesAudioSourcePanel.tsx` |

### 3.2 Store

| 当前 | 目标 |
|------|------|
| `src/stores/music-hub/music-leaderboard-ui.ts` | `src/stores/audio-hub/audio-leaderboard-ui.ts` |
| `src/stores/music-hub/music-search-ui.ts` | `src/stores/audio-hub/audio-search-ui.ts` |
| `src/stores/music-hub/music-songlist-ui.ts` | `src/stores/audio-hub/audio-songlist-ui.ts` |
| `src/stores/music-hub/leaderboard.ts` | 可保持或 → `audio-leaderboard.ts` |
| `src/stores/music-hub/search.ts` | 可保持（已在 audio-hub 目录下） |
| `src/stores/music-hub/songList.ts` | 可保持 |
| `src/stores/tv-hub/*.ts` | 随目录到 `video-hub/`；文件名无 `Tv` 前缀可不动 |

### 3.3 持久化域

| 当前 | 目标 |
|------|------|
| `src/lib/persistence/domains/music-config.ts` | `audio-config.ts` |
| `src/lib/persistence/domains/music-session.ts` | `audio-session.ts` |
| `src/lib/persistence/domains/music-ui.ts` | `audio-ui.ts` |
| `src/lib/persistence/domains/tv-config.ts` | `video-config.ts` |
| `src/lib/persistence/domains/tv-session.ts` | `video-session.ts` |
| `src/lib/persistence/domains/tv-ui.ts` | `video-ui.ts` |

### 3.4 数据库 DAO（非 migration 脚本）

| 当前 | 目标 |
|------|------|
| `src/lib/database/music-playback-state.ts` | `audio-playback-state.ts` |
| `src/lib/media/tv/db/tv-dao.ts` | `src/lib/media/video/db/video-dao.ts` |

### 3.5 `lib/media/audio/` 下带 `music-` 前缀的模块文件

机械规则：`music-*.ts` → `audio-*.ts`（**建议本批改**）：

| 当前 | 目标 |
|------|------|
| `music-backup.ts` | `audio-backup.ts` |
| `music-config-storage.ts` | `audio-config-storage.ts` |
| `music-context-actions.ts` | `audio-context-actions.ts` |
| `music-deeplink.ts` | `audio-deeplink.ts` |
| `music-hub-section-meta.ts` | `audio-hub-section-meta.ts` |
| `music-loading-ui.ts` | `audio-loading-ui.ts` |
| `music-local-search.ts` | `audio-local-search.ts` |
| `music-play-config.ts` | `audio-play-config.ts` |
| `music-play-timer.ts` | `audio-play-timer.ts` |
| `music-playback-status.ts` | `audio-playback-status.ts` |
| `music-playlist-list-layout.ts` | `audio-playlist-list-layout.ts` |
| `music-quality.ts` | `audio-quality.ts` |
| `music-search-result-ui.ts` | `audio-search-result-ui.ts` |
| `music-settings.ts` | `audio-settings.ts` |
| `library/music-file-filter.ts` | `library/audio-file-filter.ts` |
| `library/scan-android-music.ts` | `library/scan-android-audio.ts` |
| `platform/music-hotkeys.ts` | `platform/audio-hotkeys.ts` |
| `platform/music-openapi-client.ts` | `platform/audio-openapi-client.ts` |
| `platform/music-openapi-state.ts` | `platform/audio-openapi-state.ts` |
| `platform/music-playback-platform.ts` | `platform/audio-playback-platform.ts` |

### 3.6 主题

| 当前 | 目标 |
|------|------|
| `src/lib/theme/music-module-theme-presets.ts` | `audio-module-theme-presets.ts` |

### 3.7 UI：原 `components/viewer/audio/music/**`

**目录调整后**，文件名一律 `Music*` → `Audio*`，`music-*` → `audio-*`。

#### 根级（原 `music/`）

| 当前 | 目标 |
|------|------|
| `AudioMusicHubView.tsx` | `AudioHubView.tsx` |
| `AudioMusicModeView.tsx` | `AudioModeView.tsx` |
| `MusicAppSelect.tsx` | `AudioAppSelect.tsx` |

#### `hub/`（约 40+ 文件，机械替换）

规则：`MusicXxx.tsx` → `AudioXxx.tsx`；`useMusicHubPlayer.ts` → `useAudioHubPlayer.ts`；`music-hub-mobile-chrome.ts` → `audio-hub-mobile-chrome.ts`。

完整当前文件名列表（改前核对用）：

```text
MusicAddToListDialog.tsx
MusicAudioVisualizer.tsx
MusicCommentPane.tsx
MusicEqualizerEditor.tsx
MusicHubAsideNav.tsx
MusicHubContent.tsx
MusicHubDesktopLayout.tsx
MusicHubDrawerNav.tsx
MusicHubListPane.tsx
MusicHubMobileLayout.tsx
MusicHubPageShell.tsx
MusicHubPlayBar.tsx
MusicHubQuickScroll.tsx
MusicHubShell.tsx
MusicHubSkeletons.tsx
MusicLeaderboardPane.tsx
MusicListCreateDialog.tsx
MusicListExportDialog.tsx
MusicListImportDialog.tsx
MusicListSaveDialog.tsx
MusicListUpdateManageDialog.tsx
MusicMovePositionDialog.tsx
MusicOpenListDialog.tsx
MusicPlaybackRateCombobox.tsx
MusicPlayDetail.tsx
MusicPlayDetailSettingsPopup.tsx
MusicPlaylistContextMenu.tsx
MusicPlaylistListCard.tsx
MusicPlaylistSidebar.tsx
MusicPlaylistVirtualList.tsx
MusicPlayTimerDialog.tsx
MusicQueuePane.tsx
MusicQueuePanel.tsx
MusicSearchPane.tsx
MusicSearchPaneToolbar.tsx
MusicSearchResultLists.tsx
MusicSongListDetail.tsx
MusicSongListPane.tsx
MusicSongListPaneToolbar.tsx
MusicTrackContextMenu.tsx
MusicTrackList.tsx
MusicTrackSourceDialog.tsx
useMusicHubPlayer.ts
music-hub-mobile-chrome.ts
```

#### `settings/`

| 当前模式 | 目标 |
|----------|------|
| `MusicSettings*.tsx` | `AudioSettings*.tsx` |
| `MusicPlayDetailLyricFontSizeField.tsx` | `AudioPlayDetailLyricFontSizeField.tsx` |
| `music-settings-sections.ts` | `audio-settings-sections.ts` |

### 3.8 UI：原 `components/viewer/tv/**`

| 当前 | 目标（目录已到 `video-hub/` 或 `video/`） |
|------|------|
| `hub/TvHubContent.tsx` | `VideoHubContent.tsx` |
| `hub/TvHubShell.tsx` | `VideoHubShell.tsx` |
| `panes/TvDetailPane.tsx` | `VideoDetailPane.tsx` |
| `panes/TvHistoryPane.tsx` | `VideoHistoryPane.tsx` |
| `panes/TvHomePane.tsx` | `VideoHomePane.tsx` |
| `panes/TvKeepPane.tsx` | `VideoKeepPane.tsx` |
| `panes/TvLivePane.tsx` | `VideoLivePane.tsx` |
| `panes/TvPlayPane.tsx` | `VideoPlayPane.tsx` |
| `panes/TvSearchPane.tsx` | `VideoSearchPane.tsx` |
| `panes/TvSettingsPane.tsx` | `VideoSettingsPane.tsx` |

### 3.9 测试文件

| 当前 | 目标 |
|------|------|
| `src/test/compat/media/music-*.compat.test.ts` | `audio-*.compat.test.ts` |
| `src/test/compat/media/tv-core.compat.test.ts` | `video-core.compat.test.ts` |
| `src/test/lib/media/audio/music-*.test.ts` | `audio-*.test.ts` |
| `src/test/lib/theme/music-module-theme-presets.test.ts` | `audio-module-theme-presets.test.ts` |

### 3.10 文档（可选）

| 当前 | 目标 |
|------|------|
| `docs/music-settings-lx-audit.md` | `docs/audio-settings-lx-audit.md` |

---

## 4. 可选 / 可推迟

| 项 | 说明 |
|----|------|
| `lib/media/audio/music-sdk/` 整树 | 协议层仍叫「music」有历史含义；可改 `audio-sdk` / `online-sdk`，工作量大 |
| `music-sdk/**/music-info.ts` | 平台接口实体名，可留 |
| `tools/tv-jar-host` + Java 包 | 目录可改；`com.reader.tvjarhost` 需改代码，另开任务 |
| migration-v10x-*-music/tv*.ts | **建议永不改文件名** |

---

## 5. 推荐执行顺序（checklist）

- [ ] **冲突确认**：`components/viewer/video/` 已存在 → 决定 `tv` 迁到 `video-hub` 还是合并  
- [ ] 目录：`pages/music` → `pages/audio`，`pages/tv` → `pages/video`  
- [ ] 目录：`stores/music-hub` → `audio-hub`，`stores/tv-hub` → `video-hub`  
- [ ] 目录：整理 `components/viewer/audio/music` → 去掉中间 `music`  
- [ ] 目录：`components/viewer/tv` → `video-hub`（或合并方案）  
- [ ] 目录：`lib/media/tv` → `lib/media/video`  
- [ ] 批量文件：`Music*`→`Audio*`，`Tv*`→`Video*`，`music-*`→`audio-*`，`tv-*`→`video-*`（跳过 §1 排除项）  
- [ ] DAO / persistence / theme / tests（§3.3–3.9）  
- [ ] `pnpm test` / `pnpm build`  
- [ ] （可选）`music-sdk`、tools、docs  

---

## 6. 规模估算（便于排期）

| 类别 | 约数量 |
|------|--------|
| 必做目录 | 6–8 个 |
| 音频 UI `Music*` 文件 | ~70+ |
| 视频 UI `Tv*` 文件 | ~12 |
| lib/persistence + database DAO + theme | ~10 |
| lib/media/audio 下 `music-*` | ~20 |
| 测试 | ~10 |
| **本批合计（不含 music-sdk / tools）** | **约 120–140 次重命名** |

---

## 7. 与数据库计划的边界

本文**只**动仓库内路径/文件名。  
表名 `audio_*` / `video_*`、`music_playback_state`→`audio_playback_state` 等属 [SHELL_MODULE_MIGRATION.md](./SHELL_MODULE_MIGRATION.md) 的 **M2/M4 数据迁移**，不要在「仅重命名文件」批次里改 SQL/迁移逻辑。
