/**
 * 影视设置 → 番剧分区
 * 规则导入/管理见 TvBangumiRulesManager；此处为 API / 界面 / 番剧专属弹幕项 / 抽流偏好 + 缓存/快照
 * 弹幕观感与选源见影视设置「播放 / 弹幕」「内置弹幕源」
 */

import { Show, createSignal, createMemo, onMount } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { showAppToast } from '@/components/shared/AppToasts';
import { TvBangumiRulesManager } from '@/components/media/viewer/video/tv/settings/TvBangumiRulesManager';
import { ensureBangumiDaoMigrated } from '@/lib/media/video/bangumi/dao-bridge';
import {
  getBangumiModulePrefs,
  setBangumiModulePrefs,
  resetBangumiDanmakuPrefs,
  type BangumiModulePrefs,
  type BangumiResolveMode,
  type BangumiTagControl,
  type BangumiTimelineSort,
} from '@/lib/media/video/bangumi/prefs';
import {
  getBangumiMetaPrefs,
  setBangumiMetaPrefs,
} from '@/lib/media/video/bangumi/meta/prefs';
import {
  clearEpisodeCache,
  exportEpisodeCacheManifest,
  listEpisodeCache,
} from '@/lib/media/video/cache/episode-disk-cache';
import { formatVideoCacheSize } from '@/lib/media/video/cache/video-disk-cache';
import {
  applyTvStateSnapshot,
  buildTvStateSnapshot,
  snapshotToJson,
} from '@/lib/media/tv/local/webdav-state-snapshot';
import { pickFiles } from '@/lib/platform/fs/pick-file';
import { saveTextFile } from '@/lib/export/save-text-file';
import { readBytes } from '@/lib/platform/fs/read-write';

const TAG_CONTROL_OPTS: { value: BangumiTagControl; label: string }[] = [
  { value: 'tabs', label: '分类 Tab' },
  { value: 'stacked', label: '徽标堆叠' },
  { value: 'menu', label: '分组下拉' },
];

const TIMELINE_SORT_OPTS: { value: BangumiTimelineSort; label: string }[] = [
  { value: 'heat', label: '热度优先' },
  { value: 'score', label: '评分优先' },
  { value: 'id', label: '时间优先' },
];

const RESOLVE_MODE_LABELS: Record<BangumiResolveMode, string> = {
  auto: '自动（静态→嗅探→WebView）',
  static: '仅静态解析',
  webview: '优先 WebView 抽流',
};

function SettingSwitchRow(props: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div class="flex items-center justify-between gap-3">
      <div>
        <Label class="text-sm">{props.label}</Label>
        <Show when={props.hint}>
          <p class="text-[11px] text-muted-foreground">{props.hint}</p>
        </Show>
      </div>
      <AppSwitch checked={props.checked} disabled={props.disabled} onChange={props.onChange}>
        <AppSwitchControl>
          <AppSwitchThumb />
        </AppSwitchControl>
      </AppSwitch>
    </div>
  );
}

export function TvBangumiSettingsSection() {
  const [prefsTick, setPrefsTick] = createSignal(0);

  const prefs = createMemo(() => {
    prefsTick();
    return getBangumiModulePrefs();
  });
  const metaPrefs = createMemo(() => {
    prefsTick();
    return getBangumiMetaPrefs();
  });

  onMount(() => {
    void ensureBangumiDaoMigrated().then(() => refresh());
  });

  function refresh() {
    setPrefsTick((n) => n + 1);
  }

  function patchPrefs(patch: Partial<BangumiModulePrefs>) {
    setBangumiModulePrefs(patch);
    refresh();
  }

  return (
    <div class="space-y-4 border-t border-border/60 pt-4">
      <h3 class="text-sm font-semibold">番剧</h3>

      <TvBangumiRulesManager onChanged={refresh} />

      <section class="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-3">
        <h4 class="text-xs font-semibold">Bangumi API</h4>
        <p class="text-[11px] text-muted-foreground">
          对齐 Kazumi：不暴露 API 实际地址，仅提供镜像开关（官方 ↔ api.kazumi.fyi）。
        </p>
        <SettingSwitchRow
          label="使用镜像"
          hint="对齐 Kazumi enableBangumiProxy"
          checked={metaPrefs().useMirror}
          onChange={(c) => {
            setBangumiMetaPrefs({ useMirror: c });
            refresh();
          }}
        />
      </section>

      <section class="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-3">
        <h4 class="text-xs font-semibold">界面</h4>
        <p class="text-[11px] text-muted-foreground">对齐 Kazumi interface_settings</p>
        <SettingSwitchRow
          label="显示评分"
          hint="对齐 Kazumi showRating"
          checked={prefs().showScoreBadge}
          onChange={(c) => patchPrefs({ showScoreBadge: c })}
        />
        <SettingSwitchRow
          label="显示追番统计"
          hint="对齐 Kazumi showAnimeCounter"
          checked={prefs().showAnimeCounter}
          onChange={(c) => patchPrefs({ showAnimeCounter: c })}
        />
        <div class="space-y-1">
          <Label class="text-xs">分类展示</Label>
          <AppSelect
            value={prefs().tagControl}
            onChange={(v) => {
              if (v === 'tabs' || v === 'stacked' || v === 'menu') patchPrefs({ tagControl: v });
            }}
            options={TAG_CONTROL_OPTS.map((o) => o.value)}
            itemComponent={(p) => {
              const v = String(p.item.rawValue);
              const label = TAG_CONTROL_OPTS.find((o) => o.value === v)?.label || v;
              return <AppSelectItem item={p.item}>{label}</AppSelectItem>;
            }}
          >
            <AppSelectTrigger layout="form" class="h-9" aria-label="分类展示">
              <AppSelectValue>
                {() =>
                  TAG_CONTROL_OPTS.find((o) => o.value === prefs().tagControl)?.label ||
                  prefs().tagControl
                }
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
        </div>
        <div class="space-y-1">
          <Label class="text-xs">时间表排序</Label>
          <AppSelect
            value={prefs().timelineSort}
            onChange={(v) => {
              if (v === 'heat' || v === 'score' || v === 'id') patchPrefs({ timelineSort: v });
            }}
            options={TIMELINE_SORT_OPTS.map((o) => o.value)}
            itemComponent={(p) => {
              const v = String(p.item.rawValue);
              const label = TIMELINE_SORT_OPTS.find((o) => o.value === v)?.label || v;
              return <AppSelectItem item={p.item}>{label}</AppSelectItem>;
            }}
          >
            <AppSelectTrigger layout="form" class="h-9" aria-label="时间表排序">
              <AppSelectValue>
                {() =>
                  TIMELINE_SORT_OPTS.find((o) => o.value === prefs().timelineSort)?.label ||
                  prefs().timelineSort
                }
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
        </div>
        <SettingSwitchRow
          label="仅显示在看（已追番）"
          checked={prefs().timelineOnlyWatching}
          onChange={(c) => patchPrefs({ timelineOnlyWatching: c })}
        />
        <SettingSwitchRow
          label="隐藏看过"
          hint="需收藏分型；暂无效果"
          checked={prefs().timelineHideWatched}
          onChange={(c) => patchPrefs({ timelineHideWatched: c })}
        />
        <SettingSwitchRow
          label="隐藏弃番"
          hint="需收藏分型；暂无效果"
          checked={prefs().timelineHideAbandoned}
          onChange={(c) => patchPrefs({ timelineHideAbandoned: c })}
        />
      </section>

      <section class="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-3">
        <h4 class="text-xs font-semibold">弹幕</h4>
        <p class="text-[11px] leading-relaxed text-muted-foreground">
          观感、续播、播完下一集与选源已统一到影视设置「播放 / 弹幕」与「内置弹幕源（danmu_api）」。此处仅保留番剧专属项。
        </p>
        <SettingSwitchRow
          label="默认开启弹幕"
          checked={prefs().danmakuEnabledByDefault}
          onChange={(c) => patchPrefs({ danmakuEnabledByDefault: c })}
        />
        <SettingSwitchRow
          label="允许本地发送"
          hint="自发弹幕仅在本机播放器上屏；关闭且未开远程时不显示发送框"
          checked={prefs().enableDanmakuSendLocal}
          onChange={(c) => patchPrefs({ enableDanmakuSendLocal: c })}
        />
        <SettingSwitchRow
          label="允许远程发送"
          hint="推送到弹弹或 DANMU_PUSH_URL；需先配置密钥/地址"
          checked={prefs().enableDanmakuSendRemote}
          onChange={(c) => patchPrefs({ enableDanmakuSendRemote: c })}
        />
        <SettingSwitchRow
          label="下载/缓存弹幕"
          hint="缓存剧集时同步拉取并落盘弹幕，便于离线观看"
          checked={prefs().downloadDanmaku}
          onChange={(c) => patchPrefs({ downloadDanmaku: c })}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            resetBangumiDanmakuPrefs();
            refresh();
            showAppToast({ title: '已恢复弹幕默认设置', variant: 'success' });
          }}
        >
          恢复弹幕默认
        </Button>
      </section>

      <section class="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-3">
        <h4 class="text-xs font-semibold">抽流</h4>
        <AppSelect
          value={prefs().resolveMode}
          onChange={(v) => {
            if (v === 'auto' || v === 'static' || v === 'webview')
              patchPrefs({ resolveMode: v as BangumiResolveMode });
          }}
          options={['auto', 'static', 'webview']}
          itemComponent={(p) => (
            <AppSelectItem item={p.item}>
              {RESOLVE_MODE_LABELS[p.item.rawValue as BangumiResolveMode] ||
                String(p.item.rawValue)}
            </AppSelectItem>
          )}
        >
          <AppSelectTrigger layout="form" class="h-9" aria-label="抽流模式">
            <AppSelectValue>
              {() => RESOLVE_MODE_LABELS[prefs().resolveMode] || prefs().resolveMode}
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectListbox />
          </AppSelectContent>
        </AppSelect>
      </section>

      <div class="space-y-2">
        <h4 class="text-xs font-semibold">剧集缓存（快捷）</h4>
        <p class="text-[11px] text-muted-foreground">
          完整占用预览 / 分级清理见上方「影视缓存」。此处保留导出与一键清空。
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void listEpisodeCache().then((list) =>
                showAppToast({
                  title: `缓存 ${list.length} 条`,
                  description: formatVideoCacheSize(
                    list.reduce((s, m) => s + (m.byteSize || 0), 0),
                  ),
                  variant: 'info',
                }),
              );
            }}
          >
            查看数量
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void exportEpisodeCacheManifest().then((json) =>
                saveTextFile('bangumi-episode-cache.json', json, { moduleKey: 'video' }).then(() =>
                  showAppToast({ title: '已导出缓存清单', variant: 'success' }),
                ),
              );
            }}
          >
            导出清单
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!confirm('清空全部剧集缓存（含 manual）？')) return;
              void clearEpisodeCache().then((n) =>
                showAppToast({ title: `已清除 ${n} 项`, variant: 'success' }),
              );
            }}
          >
            清空缓存
          </Button>
        </div>
      </div>

      <div class="space-y-2">
        <h4 class="text-xs font-semibold">收藏/历史快照（可与 WebDAV 手传）</h4>
        <div class="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void buildTvStateSnapshot().then((snap) =>
                saveTextFile('reader-tv-state.json', snapshotToJson(snap), {
                  moduleKey: 'video',
                }).then(() => showAppToast({ title: '已导出快照', variant: 'success' })),
              );
            }}
          >
            导出快照
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void pickFiles({
                multiple: false,
                filters: [{ name: 'JSON', extensions: ['json'] }],
              })
                .then(async (files) => {
                  const f = files?.[0];
                  if (!f) return;
                  const bytes = f.bytes ?? (await readBytes(f.ref));
                  const text = new TextDecoder().decode(bytes);
                  const r = await applyTvStateSnapshot(JSON.parse(text), 'merge');
                  showAppToast({
                    title: '已合并快照',
                    description: `keep ${r.keep} · history ${r.history}`,
                    variant: 'success',
                  });
                })
                .catch(() => undefined);
            }}
          >
            导入合并
          </Button>
        </div>
      </div>
    </div>
  );
}
