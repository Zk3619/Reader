# Checkbox 调用位置审计

## 基准

本次以官方示例作为严格判定标准：

```tsx
<Checkbox id="terms1" />
<Label for="terms1-input">Accept terms and conditions</Label>
```

要求：

1. `Checkbox` 有稳定且唯一的 `id`。
2. 使用 `@/components/ui/label` 的 `Label`，不使用原生 `<label>` 包裹 `Checkbox`。
3. `Label.for` 指向 Checkbox 内部 input，即 `${id}-input`。
4. 只有图标或表格选择框时，也应提供相邻的 `Label class="sr-only"`。
5. 不要把 Checkbox 嵌套在 `Button`、菜单项或另一个整行点击控件中；如必须保留整行点击，需要避免一次点击触发两次状态切换。

## 当前组件的 ID 差异

`src/components/ui/checkbox.tsx` 当前将调用方传入的 `id` 直接赋给内部 input：

```tsx
<CheckboxPrimitive.Input id={local.id} class="peer" />
```

因此，在不修改共享组件的前提下，实际可用写法是让 `Checkbox.id` 与 `Label.for` 完全相同。为保留官方示例中的内部 input 命名，本次迁移直接把 `-input` 放入两者的 ID：

```tsx
<Checkbox id="music-hub-muted-input" />
<Label for="music-hub-muted-input">静音</Label>
```

若以后需要让调用方只传基础 ID，并由共享组件自动生成 `${id}-input`，应先调整共享组件的 ID 生成方式，再批量迁移调用。不要只修改 `Label.for`，否则标签无法关联当前内部 input。

## 审计结果

审计时在 46 个文件中找到 96 个 `<Checkbox>` 调用；按上述官方结构严格判断，符合项为 0。下面行号是本次审计时的位置，后续编辑可能造成少量偏移。

## 音乐模块

以下非列表设置项已改为相邻 `Checkbox + Label`，并移除 Label 的手型指针样式：

- `src/components/viewer/audio/music/hub/MusicHubPlayBar.tsx`：静音。
- `src/components/viewer/audio/music/settings/MusicSettingsDesktopLyric.tsx`：3 项。
- `src/components/viewer/audio/music/settings/MusicSettingsPlay.tsx`：12 项。
- `src/components/viewer/audio/music/settings/MusicSettingsList.tsx`：7 项。
- `src/components/viewer/audio/music/settings/MusicSettingsSearch.tsx`：5 项。
- `src/components/viewer/audio/music/settings/MusicSettingsDownload.tsx`：1 项。
- `src/components/viewer/audio/music/settings/MusicSettingsPlayDetail.tsx`：2 项。
- `src/components/viewer/audio/music/AudioSourceSettings.tsx`：离线优先、多源兜底。
- `src/components/viewer/audio/music/UserApiUpdateAlertHost.tsx`：全局 7 天免检查。

按本次范围暂不调整以下菜单项、列表项和整行交互项：

- `src/components/viewer/audio/music/hub/MusicTrackList.tsx:77,203,258`
  - 只有 `aria-label`，没有相邻 `Label`。
  - 建议 ID：`music-track-select-all`、`music-track-select-${source}-${track.id}`。
  - 桌面与移动分支互斥时可共用动态基础 ID，并增加 `Label class="sr-only"`。

- `src/components/viewer/audio/music/hub/MusicAddToListDialog.tsx:185`
  - Checkbox 嵌套在 `Button` 中，没有相邻 Label。
  - 建议 ID：`music-add-target-${target.listId}`。
  - 应改为普通选择行容器，由 Checkbox 与 Label 提供选择语义。

- `src/components/viewer/audio/music/hub/MusicListUpdateManageDialog.tsx:112`
  - 原生 `<label>` 包裹。
  - 建议 ID：`music-list-auto-update-${row.playlistId}`。

- `src/components/viewer/audio/music/AudioSourceSettings.tsx` 的 UserApi 行内“更新提示”
  - 位于动态音源列表项内，保持原结构。

- `src/components/viewer/audio/music/UserApiUpdateAlertHost.tsx` 的逐音源“7 天内不再提示”和“忽略本次更新”
  - 位于更新列表项内，保持原结构。

## 通用组件、页面与设置

- `src/components/shared/AppDropdownMenu.tsx:113`
  - Checkbox 位于菜单项中，没有相邻 Label。
  - 通用组件应使用 `createUniqueId()` 生成稳定的局部 ID，并处理菜单项与 Label 的重复触发。

- `src/pages/settings/ThemesManagePage.tsx:362`
  - Checkbox 位于 `role="button"` 的主题行中，没有 Label。
  - 建议 ID：`theme-select-${record.id}`，增加 `Label class="sr-only"`。

- `src/components/theme/ImportThemeSelectDialog.tsx:58,150`
  - Checkbox 位于整行点击容器中并设置了 `pointer-events-none`，没有 Label。
  - 建议 ID：`import-theme-select-all`、`import-theme-${pack.id}`。

- `src/pages/rss/RuleSubPage.tsx:118`
  - Checkbox 位于通用点击行中并设置了 `pointer-events-none`，没有 Label。
  - 建议由调用方传入稳定规则 key，生成 `rss-rule-${ruleKey}`。

- `src/pages/rss/RssSourcesManagePage.tsx:795`
  - 只有 `aria-label`，没有相邻 Label。
  - 建议 ID：`rss-source-select-${stableSourceKey}`。

- `src/pages/remote-book/RemoteBookPage.tsx:434,464`
  - 全选框没有 Label；条目选择框位于整行点击容器中。
  - 建议 ID：`remote-book-select-all`、`remote-book-select-${stablePathKey}`。

- `src/components/settings/SourceBlocklistSetting.tsx:88`
  - Checkbox 位于原生 `<label>` 与自定义点击代理中，并设置了 `pointer-events-none`。
  - 建议 ID：`source-blocklist-${entry.id}`。

- `src/pages/sources/SourcesManagePage.tsx:222`
  - Checkbox 位于 `role="button"` 的可点击行中，没有 Label。
  - 建议 ID：`source-select-${stableSourceKey}`。

- `src/components/settings/BackupSelectorDialog.tsx:73`
  - 原生 `<label>` 包裹。
  - 建议 ID：`backup-selector-${item.key}`。

- `src/components/dict-rules/DictRuleListItem.tsx:52`
  - Checkbox 位于 `role="button"` 的行中，没有 Label。
  - 建议 ID：`dict-rule-select-${rule.id}`。

- `src/components/replace-rules/ReplaceRuleListItem.tsx:64`
  - Checkbox 位于 `role="button"` 的行中，没有 Label。
  - 建议 ID：`replace-rule-select-${rule.id}`。

- `src/components/txt-toc-rules/TxtTocRuleListItem.tsx:56`
  - Checkbox 位于 `role="button"` 的行中，没有 Label。
  - 建议 ID：`txt-toc-rule-select-${rule.id}`。

- `src/components/shell/PageHeader.tsx:207`
  - Checkbox 位于 `AppDropdownMenuItem` 中，没有 Label。
  - 建议使用菜单项稳定 key 生成 `page-header-checkbox-${itemKey}`。

## 书源、RSS 与规则对话框

- `src/components/sources/SourcesFilterDialog.tsx:250,279,290`
  - 均由原生 `<label>` 包裹。
  - 建议 ID：`source-filter-group-${stableGroupKey}`、`source-filter-enabled-${option.value}`、`source-filter-special-${option.value}`。

- `src/components/sources/ImportSourceSelectDialog.tsx:66,179`
  - Checkbox 位于整行点击容器中并设置了 `pointer-events-none`，没有 Label。
  - 建议 ID：`import-source-select-all`、`import-source-${stableSourceKey}`。

- `src/components/rss/ImportRssSourceSelectDialog.tsx:64,174`
  - Checkbox 位于整行点击容器中并设置了 `pointer-events-none`，没有 Label。
  - 建议 ID：`import-rss-source-select-all`、`import-rss-source-${stableSourceKey}`。

- `src/components/sources/SourcesSortDropdown.tsx:164,183`
  - Checkbox 位于菜单项中，没有相邻 Label。
  - 建议 ID：`source-sort-reverse`、`source-sort-drag-enabled`。

- `src/components/replace-rules/ImportReplaceRuleSelectDialog.tsx:60,155`
  - Checkbox 位于整行点击容器中并设置了 `pointer-events-none`，没有 Label。
  - 建议 ID：`import-replace-rule-select-all`、`import-replace-rule-${stableComparisonKey}`。

- `src/components/rss/RssSourcesManageFilterDialog.tsx:245,300,328,339`
  - 均由原生 `<label>` 包裹。
  - 建议 ID：`rss-filter-group-${stableGroupKey}`、`rss-filter-domain-${stableDomainKey}`、`rss-filter-enabled-${option.value}`、`rss-filter-special-${option.value}`。

- `src/components/sources/SourceGroupManageDialog.tsx:171`
  - 已有 `Checkbox id="source-group-fuzzy-search"` 和相邻 Label，但 `Label.for` 未按官方约定指向 `source-group-fuzzy-search-input`。

## 书架与书籍

- `src/components/bookshelf/BookshelfLayoutDialog.tsx:72`
  - 启用时由原生 `<label>` 包裹，禁用时使用普通容器，结构不一致。
  - 可保留 `props.id`，统一改为普通容器与相邻 Label。

- `src/components/bookshelf/BookshelfManagePageToolbar.tsx:203,212,223,235,244`
  - 五个 Checkbox 均位于菜单项中，没有 Label。
  - 建议 ID：`bookshelf-filter-by-group`、`bookshelf-filter-by-source`、`bookshelf-open-info-by-title`、`bookshelf-cover-click-preview`、`bookshelf-drag-sort`。

- `src/components/bookshelf/BookGroupPickDialog.tsx:168`
  - 原生 `<label>` 包裹。
  - 建议 ID：`book-group-pick-${group.groupId}`。

- `src/components/bookshelf/BookGroupManagePageToolbar.tsx:190,199`
  - Checkbox 位于菜单项中，没有 Label。
  - 建议 ID：`book-group-cover-preview`、`book-group-drag-sort`。

- `src/components/shell/WindowControlButtons.tsx:223`
  - 已有 `Checkbox id="window-close-remember"` 与相邻 Label，但 `Label.for` 没有使用官方的 `-input` 后缀。

- `src/components/bookshelf/BookshelfManageFilterDialog.tsx:167,209`
  - 均由原生 `<label>` 包裹。
  - 建议 ID：`bookshelf-filter-group-${group.groupId}`、`bookshelf-filter-source-${stableSourceKey}`。

- `src/components/books/ReplaceFileDialog.tsx:149`
  - 已有 `Checkbox id="remember-replace"` 与相邻 Label，但 `Label.for` 没有使用官方的 `-input` 后缀。

- `src/components/books/ImportActionDialog.tsx:119`
  - 已有 `Checkbox id="remember-action"` 与相邻 Label，但 `Label.for` 没有使用官方的 `-input` 后缀。

- `src/components/books/DeleteBookDialog.tsx:85,102`
  - 已有 `delete-file`、`remember-delete` ID 与相邻 Label，但两个 `Label.for` 均没有使用官方的 `-input` 后缀。

- `src/components/bookshelf/BookshelfCacheGroupFilterDialog.tsx:135`
  - 原生 `<label>` 包裹。
  - 建议 ID：`bookshelf-cache-group-${group.groupId}`。

- `src/components/explore/ExploreLayoutDialog.tsx:68`
  - 已有 `Checkbox id={props.id}` 与相邻 Label，但 `Label.for` 没有使用官方的 `-input` 后缀。

- `src/components/bookshelf/BookshelfCacheExportDialog.tsx:368,445`
  - 已有 `image-group-by-chapter`、`audio-merge-single` ID 与相邻 Label，但两个 `Label.for` 均没有使用官方的 `-input` 后缀。

- `src/components/bookshelf/BookshelfManageBookRow.tsx:165`
  - Checkbox 位于整行点击区域，没有 Label。
  - 建议 ID：`bookshelf-book-select-${stableBookKey}`，增加 `Label class="sr-only"`。

- `src/components/bookshelf/BookSearchScopeDialog.tsx:129,172`
  - 第一处已有相邻 Label，但 ID 基于 placeholder，可能重复且 `Label.for` 没有 `-input` 后缀。
  - 第二处由原生 `<label>` 包裹。
  - 建议由调用方提供稳定 scope/条目 key，不要依赖 placeholder 或虚拟列表索引。

## 建议迁移顺序

1. 先决定是否让共享 Checkbox 完全采用官方 `${id}-input` 约定。
2. 优先迁移原生 `<label>` 包裹项，解决方框点击后连续切换两次的问题。
3. 再迁移 `Button`、菜单项、`role="button"` 与整行点击容器中的 Checkbox，逐一处理事件重复触发。
4. 最后补齐纯图标、表格和列表选择框的 `sr-only` Label。
5. 每批迁移后验证鼠标点击方框、点击文字、空格键、禁用状态和全选/不确定状态。
