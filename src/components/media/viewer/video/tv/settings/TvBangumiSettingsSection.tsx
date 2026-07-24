/**
 * 影视设置 → 番剧分区
 * 规则导入/管理见 TvBangumiRulesManager；此处为 API / 界面 / 弹幕 / 播放 / 抽流 偏好 + 缓存/快照
 */

import { For, Show, createSignal, createMemo, onMount } from 'solid-js';
import { Slider, SliderFill, SliderThumb, SliderTrack } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
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
import { XIcon } from '@/components/shared/icons';
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

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** 弹幕/界面偏好用滑杆行：标签 + 当前值 + Slider */
function PrefSliderRow(props: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const display = () =>
    props.format ? props.format(props.value) : `${props.value}${props.suffix ?? ''}`;
  return (
    <div class="space-y-1.5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label class="text-sm">{props.label}</Label>
          <Show when={props.hint}>
            <p class="text-[11px] text-muted-foreground">{props.hint}</p>
          </Show>
        </div>
        <span class="tabular-nums text-xs text-muted-foreground">{display()}</span>
      </div>
      <Slider
        class="w-full"
        minValue={props.min}
        maxValue={props.max}
        step={props.step}
        value={[props.value]}
        disabled={props.disabled}
        onChange={(values) => {
          const v = values[0];
          if (v == null) return;
          props.onChange(clampFinite(v, props.min, props.max));
        }}
      >
        <SliderTrack>
          <SliderFill />
          <SliderThumb />
        </SliderTrack>
      </Slider>
    </div>
  );
}

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
  const [keywordInput, setKeywordInput] = createSignal('');

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

  function addKeyword() {
    const raw = keywordInput().trim();
    if (!raw) return;
    const parts = raw
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const set = new Set([...prefs().danmakuBlockKeywords, ...parts]);
    patchPrefs({ danmakuBlockKeywords: [...set] });
    setKeywordInput('');
  }

  function removeKeyword(word: string) {
    patchPrefs({ danmakuBlockKeywords: prefs().danmakuBlockKeywords.filter((w) => w !== word) });
  }

  return (
    <div class="space-y-4 border-t border-border/60 pt-4">
      <h3 class="text-sm font-semibold">番剧</h3>

      <TvBangumiRulesManager onChanged={refresh} />

      <section class="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-3">
        <h4 class="text-xs font-semibold">Bangumi API</h4>
        <SettingSwitchRow
          label="使用镜像"
          hint="对齐 Kazumi enableBangumiProxy"
          checked={metaPrefs().useMirror}
          onChange={(c) => {
            setBangumiMetaPrefs({ useMirror: c });
            refresh();
          }}
        />
        <div class="space-y-1">
          <Label class="text-xs">官方 API（api.bgm.tv）</Label>
          <AppTextField>
            <AppTextFieldInput
              value={metaPrefs().apiBase}
              onChange={(e: Event & { currentTarget: HTMLInputElement }) => {
                setBangumiMetaPrefs({ apiBase: e.currentTarget.value });
                refresh();
              }}
            />
          </AppTextField>
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Next API（日历 / 热门）</Label>
          <AppTextField>
            <AppTextFieldInput
              value={metaPrefs().apiNextBase}
              onChange={(e: Event & { currentTarget: HTMLInputElement }) => {
                setBangumiMetaPrefs({ apiNextBase: e.currentTarget.value });
                refresh();
              }}
            />
          </AppTextField>
        </div>
        <div class="space-y-1">
          <Label class="text-xs">镜像基址</Label>
          <AppTextField>
            <AppTextFieldInput
              value={metaPrefs().mirrorBase}
              onChange={(e: Event & { currentTarget: HTMLInputElement }) => {
                setBangumiMetaPrefs({ mirrorBase: e.currentTarget.value });
                refresh();
              }}
            />
          </AppTextField>
        </div>
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
        <p class="text-[11px] text-muted-foreground">对齐 Kazumi danmaku_settings</p>

        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">来源</p>
          <SettingSwitchRow
            label="哔哩哔哩弹幕来源"
            checked={prefs().danmakuSourceBilibili}
            onChange={(c) => patchPrefs({ danmakuSourceBilibili: c })}
          />
          <SettingSwitchRow
            label="巴哈姆特弹幕来源"
            checked={prefs().danmakuSourceGamer}
            onChange={(c) => patchPrefs({ danmakuSourceGamer: c })}
          />
          <SettingSwitchRow
            label="弹弹play弹幕来源"
            checked={prefs().danmakuSourceDandan}
            onChange={(c) => patchPrefs({ danmakuSourceDandan: c })}
          />
        </div>

        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">屏蔽关键词</p>
          <div class="flex gap-2">
            <AppTextField class="flex-1">
              <AppTextFieldInput
                placeholder="输入后回车或点击添加，可逗号分隔多个"
                value={keywordInput()}
                onInput={(e: Event & { currentTarget: HTMLInputElement }) =>
                  setKeywordInput(e.currentTarget.value)
                }
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
            </AppTextField>
            <Button size="sm" onClick={addKeyword} disabled={!keywordInput().trim()}>
              添加
            </Button>
          </div>
          <Show
            when={prefs().danmakuBlockKeywords.length > 0}
            fallback={<p class="text-[11px] text-muted-foreground">暂无屏蔽关键词</p>}
          >
            <div class="flex flex-wrap gap-1.5">
              <For each={prefs().danmakuBlockKeywords}>
                {(word) => (
                  <span class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-xs">
                    {word}
                    <button
                      type="button"
                      class="text-muted-foreground hover:text-destructive"
                      aria-label={`移除关键词 ${word}`}
                      onClick={() => removeKeyword(word)}
                    >
                      <XIcon class="h-3 w-3" />
                    </button>
                  </span>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class="space-y-3">
          <p class="text-xs font-medium text-muted-foreground">显示</p>
          <PrefSliderRow
            label="显示区域"
            hint="弹幕占屏幕高度比例"
            value={Math.round(prefs().danmakuArea * 100)}
            min={0}
            max={100}
            step={5}
            suffix="%"
            onChange={(v) => patchPrefs({ danmakuArea: v / 100 })}
          />
          <PrefSliderRow
            label="显示时长"
            value={prefs().danmakuDuration}
            min={2}
            max={16}
            step={1}
            suffix="s"
            onChange={(v) => patchPrefs({ danmakuDuration: v })}
          />
          <PrefSliderRow
            label="行间距"
            value={prefs().danmakuLineHeight}
            min={1}
            max={3}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => patchPrefs({ danmakuLineHeight: v })}
          />
          <SettingSwitchRow
            label="跟随播放速度"
            checked={prefs().danmakuFollowSpeed}
            onChange={(c) => patchPrefs({ danmakuFollowSpeed: c })}
          />
          <SettingSwitchRow
            label="显示顶部弹幕"
            checked={prefs().danmakuTop}
            onChange={(c) => patchPrefs({ danmakuTop: c })}
          />
          <SettingSwitchRow
            label="显示底部弹幕"
            checked={prefs().danmakuBottom}
            onChange={(c) => patchPrefs({ danmakuBottom: c })}
          />
          <SettingSwitchRow
            label="显示滚动弹幕"
            checked={prefs().danmakuScroll}
            onChange={(c) => patchPrefs({ danmakuScroll: c })}
          />
          <SettingSwitchRow
            label="海量弹幕模式"
            checked={prefs().danmakuMassive}
            onChange={(c) => patchPrefs({ danmakuMassive: c })}
          />
          <SettingSwitchRow
            label="弹幕去重"
            checked={prefs().danmakuDeduplication}
            onChange={(c) => patchPrefs({ danmakuDeduplication: c })}
          />
        </div>

        <div class="space-y-3">
          <p class="text-xs font-medium text-muted-foreground">样式</p>
          <SettingSwitchRow
            label="弹幕描边"
            checked={prefs().danmakuBorder}
            onChange={(c) => patchPrefs({ danmakuBorder: c })}
          />
          <PrefSliderRow
            label="描边粗细"
            value={prefs().danmakuBorderSize}
            min={0.1}
            max={3}
            step={0.1}
            format={(v) => v.toFixed(1)}
            disabled={!prefs().danmakuBorder}
            onChange={(v) => patchPrefs({ danmakuBorderSize: v })}
          />
          <SettingSwitchRow
            label="彩色弹幕"
            checked={prefs().danmakuColor}
            onChange={(c) => patchPrefs({ danmakuColor: c })}
          />
          <PrefSliderRow
            label="字体大小"
            value={prefs().danmakuFontSize}
            min={10}
            max={48}
            step={1}
            suffix="px"
            onChange={(v) => patchPrefs({ danmakuFontSize: v })}
          />
          <PrefSliderRow
            label="字体粗细"
            value={prefs().danmakuFontWeight}
            min={1}
            max={9}
            step={1}
            onChange={(v) => patchPrefs({ danmakuFontWeight: v })}
          />
          <PrefSliderRow
            label="不透明度"
            value={Math.round(prefs().danmakuOpacity * 100)}
            min={10}
            max={100}
            step={5}
            suffix="%"
            onChange={(v) => patchPrefs({ danmakuOpacity: v / 100 })}
          />
        </div>

        <PrefSliderRow
          label="时间偏移"
          hint="弹幕相对视频进度的偏移"
          value={prefs().danmakuTimeOffset}
          min={-180}
          max={180}
          step={1}
          suffix="s"
          onChange={(v) => patchPrefs({ danmakuTimeOffset: v })}
        />

        <SettingSwitchRow
          label="默认开启弹幕"
          checked={prefs().danmakuEnabledByDefault}
          onChange={(c) => patchPrefs({ danmakuEnabledByDefault: c })}
        />
        <SettingSwitchRow
          label="允许弹幕发送"
          hint="需在影视设置配置弹弹密钥"
          checked={prefs().enableDanmakuSend}
          onChange={(c) => patchPrefs({ enableDanmakuSend: c })}
        />
        <SettingSwitchRow
          label="下载/缓存弹幕"
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
        <h4 class="text-xs font-semibold">播放</h4>
        <SettingSwitchRow
          label="记忆续播"
          checked={prefs().playResume}
          onChange={(c) => patchPrefs({ playResume: c })}
        />
        <SettingSwitchRow
          label="自动播放下一集"
          checked={prefs().autoPlayNext}
          onChange={(c) => patchPrefs({ autoPlayNext: c })}
        />
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
        <h4 class="text-xs font-semibold">剧集缓存</h4>
        <div class="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void listEpisodeCache().then((list) =>
                showAppToast({ title: `缓存 ${list.length} 条`, variant: 'info' }),
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
