# libmpv 内嵌与发行许可：法律风险分析

> **重要声明**：本文为工程向风险梳理，**不是律师出具的法律意见**。公开发布前建议由具备资质的顾问按目标发行地区复核。  
> **开源定调（目标）**：含 libmpv 的正式发行以 **GPL-3.0-or-later** 开源。  
> **历史状态**：`package.json` 仍可能标注 **MIT**——换证步骤见 §9；换证前以本文「目标状态」为准做工程决策。  
> 相关选型：[VIDEO_PLAYBACK_KERNEL.md](./VIDEO_PLAYBACK_KERNEL.md)（绑定 **libmpv2**，不用停更的 ParadoxSpiral/libmpv-rs）

---

## 0. 开源 GPL 定调（回答「开源是否就没问题」）

**大体成立，不能说「完全没问题」。**

若 Reader **以 GPL-3.0-or-later 开源，并在发行二进制时提供对应源码**，则：

- 「MIT 主程序闭源 / 与内嵌 GPL libmpv 主张冲突」这一**核心张力消失**；
- 与小喵等 GPL 播放器同源策略一致，法务叙事更顺。

开源 **不能免除** 的义务：

1. 发行二进制时的 **源码提供**（同包 / URL Offer，按 GPL 版本）；  
2. **版权与许可全文**（mpv、FFmpeg、Anime4K、npm 等 NOTICE/SBOM）；  
3. **依赖兼容**：Apache-2.0（Media3）、MIT（多数前端库）可进入 GPL 作品；禁止再许可的专有依赖仍会卡；  
4. **换证权**：从 MIT 改为 GPL 需确认对全部自有代码有权换证（多人贡献时要处理）；  
5. **商店/渠道政策**（许可外）；  
6. Rust 绑定 crate（如 **libmpv2** / LGPL 系 sys）与 **GPL 的 mpv/FFmpeg 构建** 叠加时，以实际捆绑构建的 NOTICE 为准。

**本仓库定调**：目标发行许可为 **GPL-3.0-or-later**。`video-libmpv` feature 仍保留——用于 **减小默认包体 / 可选不编原生库**，**不是**为了维持「MIT 主程序 + 可选 GPL 核」双许可叙事。外置 mpv 第三路保留作无捆绑时的增强手段。

---

## 1. 背景

桌面/Android **进程内链接 libmpv**（及随包 FFmpeg 等），用于独立播放窗 / Activity、Anime4K、ASS 等。  
mpv 上游及常见构建组合涉及 **GPL-2.0 / GPL-3.0**（以及 LGPL 组件混用，视构建选项而定）。

| 状态 | 许可叙事 |
|------|----------|
| **历史** | 前端 `package.json` → MIT；与内嵌 GPL 存在张力 |
| **目标** | 整包以 GPL-3.0-or-later 开源；内嵌 libmpv 与主程序主张一致 |

Android 可选 **Media3**（Apache-2.0）可进入 GPL 作品；与 libmpv 并存时整包仍按 **GPL 发行义务** 执行，不能认为「有 Apache 模块就抵消 GPL」。

---

## 2. 组件与许可（典型情况）

| 组件 | 常见许可 | 备注 |
|------|----------|------|
| mpv / libmpv | GPL-2.0-or-later 等 | 以捆绑构建与 NOTICE 为准 |
| FFmpeg（随 mpv） | LGPL / GPL（视 `--enable-gpl`） | 完整编解码多为 GPL 构建 |
| libmpv2 / libmpv2-sys | 以 crates.io 为准（常涉 LGPL 绑定） | **选用维护中的 libmpv2**；不用 ParadoxSpiral/libmpv-rs |
| libplacebo / Anime4K GLSL | 各异 | 分发 shaders 时保留版权声明 |
| Media3 / ExoPlayer | Apache-2.0 | 可纳入 GPL 发行 |
| Artplayer / hls.js 等 | 各 npm 许可 | 维持 SBOM |

---

## 3. 动态链接 vs 静态链接（在 GPL 开源前提下）

目标已是 GPL 开源时，「传染导致必须开源」不再是主矛盾；仍建议：

| 方式 | 建议 |
|------|------|
| **动态链接** 预编译 `.dll`/`.so`/`.dylib` | 优先：便于更新 lib、NOTICE 分发清晰 |
| **静态链接** | 可用，但包体与重建成本更高 |
| **外置进程**（shell `mpv`） | 保留；无捆绑 lib 时的增强路径 |
| **`video-libmpv` feature 默认关** | 减小默认安装包；**不改变**目标仓库许可为 GPL |

---

## 4. 发行义务清单（GPL 开源 + 含或不含 libmpv）

无论是否启用 `video-libmpv`，目标 GPL 发行至少准备：

1. 根目录 **LICENSE**（GPL-3.0-or-later）与关于页链接  
2. **第三方 NOTICE**：mpv、FFmpeg、Anime4K、关键 npm/crate  
3. **对应源码提供方式**：公开 Git 仓库即常见合规路径；发安装包时注明仓库 URL / tag  
4. **SBOM** 或依赖清单（安全响应）  
5. 设置中说明：增强核使用 libmpv（GPL 组件）

启用 libmpv 的构建额外：捆绑库旁放置对应 LICENSE 片段；文档标明 lib 版本。

---

## 5. Media3 与 libmpv 并存

- Media3 可与 GPL 主程序共存。  
- 拆编译渠道可以是「体积」原因：`standard`（不编 libmpv）vs `enhanced`（编入 libmpv）——**许可同为 GPL**，不是 MIT/GPL 双轨规避。  
- 代码层：`media3` 与 `libmpv` 分模块，避免无必要静态混链。

---

## 6. 工程措施

| 措施 | 说明 |
|------|------|
| 目标许可 GPL-3.0-or-later | 开源定调 |
| `video-libmpv` + **libmpv2** | 可选捆绑；见 KERNEL |
| 动态库 + NOTICE | 随包许可证 |
| 外置 mpv（E1） | 无捆绑时硬解/ASS/shaders |
| 换证门禁 | §9；换证后再默认开启 enhanced 渠道宣传 |

---

## 7. 决策记录

| 日期 | 决策 |
|------|------|
| 2026-07-23 | 内嵌 libmpv + 独立窗/Activity；捆绑预编译库；E0 含本风险分析 |
| 2026-07-23 | Android 另接 Media3 可选核 |
| 2026-07-23 | 应用内 BT 延期；专有 P2P so Blocked |
| 2026-07-23 | **开源定调 GPL-3.0-or-later**；feature 仅控包体，不控「是否开源」 |
| 2026-07-23 | Rust 绑定采用 **libmpv2**；**禁用** ParadoxSpiral/libmpv-rs（停更） |

---

## 8. 仍建议顾问确认的问题

1. 目标司法辖区下，公开 Git + 安装包注明仓库 URL，是否满足所选 GPL 版本的源码提供要求？  
2. 根 LICENSE 从 MIT 换到 GPL-3.0-or-later 的贡献者授权是否齐全？  
3. 应用商店对 GPL + 捆绑解码器的额外政策？  
4. Anime4K / 超分相关上架表述边界（许可外）？

---

## 9. 换证步骤（文档定调后、E2.1 公开发布前）

1. 仓库根增加 / 替换为 **GPL-3.0-or-later** `LICENSE` 全文  
2. `package.json` 的 `"license"` 改为 `GPL-3.0-or-later`  
3. 关于页 / README 徽章与本文件互链  
4. 第三方 NOTICE 目录（建议 `third_party/` 或安装包旁）  
5. 确认无「禁止 GPL 再许可」的依赖  

**本轮文档不修改** `package.json` / 根 LICENSE 文件内容，仅锁定目标与步骤。
