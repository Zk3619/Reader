/**
 * E6.1：独立番剧页 — Tab：追番 / 搜索 / 规则 / 详情分集（时间表灰显）
 */

import { createSignal, For, Show, onMount } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { Label } from '@/components/ui/label';
import { AppTabs } from '@/components/shared/AppTabs';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import {
  BANGUMI_EXAMPLE_RULE,
  BANGUMI_ISOLATION_NOTE,
  exportRulesJson,
  importRulesJson,
  loadBangumiFollows,
  loadBangumiRules,
  removeBangumiRule,
  toggleBangumiFollow,
  upsertBangumiRule,
  type BangumiFollow,
  type BangumiRule,
} from '@/lib/media/video/bangumi/rules';
import {
  loadDetail,
  resolvePlayUrl,
  searchAllRules,
  type BangumiDetail,
  type BangumiSearchHit,
} from '@/lib/media/video/bangumi/engine';
import { openInExternalPlayer, getPreferredExternalPlayer } from '@/lib/media/tv/play/external-player';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import {
  joinGlslShadersArg,
  resolveShaderPaths,
} from '@/lib/media/video/playback/anime4k';
import { invoke } from '@tauri-apps/api/core';
import { showAppToast } from '@/components/shared/AppToasts';
import { cn } from '@/lib/utils';

type TabId = 'follow' | 'search' | 'schedule' | 'rules' | 'detail';

function newId(): string {
  return `bg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function emptyRuleDraft(): BangumiRule {
  return {
    id: newId(),
    name: '',
    baseUrl: 'https://',
    enabled: true,
    version: 2,
  };
}

async function playMedia(url: string, title?: string) {
  const prefs = getVideoPlaybackPrefs();
  const glsl =
    joinGlslShadersArg(
      resolveShaderPaths(prefs.anime4kShadersDir, prefs.anime4kMode, prefs.anime4kQuality),
    ) || null;
  try {
    await invoke('video_libmpv_open_window', {
      url,
      title: title ?? null,
      startSec: null,
      subtitle: prefs.preferredSubtitlePath || null,
      glslShaders: glsl,
    });
    showAppToast({ title: '增强播放', description: title || url });
  } catch {
    await openInExternalPlayer(url, {
      kind: getPreferredExternalPlayer(),
      title,
      anime4k: { mode: prefs.anime4kMode, quality: prefs.anime4kQuality },
    });
    showAppToast({ title: '已交外置播放', description: title || url });
  }
}

export function TvBangumiPane() {
  const [tab, setTab] = createSignal<TabId>('follow');
  const [rules, setRules] = createSignal<BangumiRule[]>([]);
  const [follows, setFollows] = createSignal<BangumiFollow[]>([]);
  const [draft, setDraft] = createSignal<BangumiRule>(emptyRuleDraft());
  const [keyword, setKeyword] = createSignal('');
  const [searchHits, setSearchHits] = createSignal<BangumiSearchHit[]>([]);
  const [searchBusy, setSearchBusy] = createSignal(false);
  const [detail, setDetail] = createSignal<BangumiDetail | null>(null);
  const [detailRuleId, setDetailRuleId] = createSignal<string | null>(null);
  const [detailBusy, setDetailBusy] = createSignal(false);
  const [importText, setImportText] = createSignal('');

  onMount(() => {
    setRules(loadBangumiRules());
    setFollows(loadBangumiFollows());
  });

  const findRule = (id: string | null) =>
    id ? rules().find((r) => r.id === id) : undefined;

  const openDetail = async (ruleId: string, url: string) => {
    const rule = findRule(ruleId);
    if (!rule) {
      showAppToast({ title: '找不到规则' });
      return;
    }
    setDetailBusy(true);
    setDetailRuleId(ruleId);
    setTab('detail');
    try {
      const d = await loadDetail(rule, url);
      setDetail(d);
    } catch (e) {
      setDetail(null);
      showAppToast({
        title: '加载详情失败',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setDetailBusy(false);
    }
  };

  const runSearch = async () => {
    const kw = keyword().trim();
    if (!kw) {
      showAppToast({ title: '请输入关键词' });
      return;
    }
    setSearchBusy(true);
    try {
      const { hits, errors } = await searchAllRules(rules(), kw);
      setSearchHits(hits);
      if (errors.length) {
        showAppToast({
          title: `部分规则失败（${errors.length}）`,
          description: errors.slice(0, 2).join('；'),
        });
      } else if (!hits.length) {
        showAppToast({ title: '无结果' });
      }
    } finally {
      setSearchBusy(false);
    }
  };

  const saveDraft = () => {
    const r = draft();
    if (!r.name.trim() || !/^https?:\/\//i.test(r.baseUrl.trim())) {
      showAppToast({ title: '请填写名称与 http(s) 根地址' });
      return;
    }
    setRules(upsertBangumiRule({ ...r, version: 2 }));
    showAppToast({ title: '规则已保存', description: BANGUMI_ISOLATION_NOTE });
    setDraft(emptyRuleDraft());
  };

  const playEpisode = async (epUrl: string, epName: string) => {
    const rule = findRule(detailRuleId());
    if (!rule) return;
    try {
      const media = await resolvePlayUrl(rule, epUrl);
      await playMedia(media, `${detail()?.title || ''} ${epName}`.trim());
    } catch (e) {
      showAppToast({
        title: '取链失败',
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const doExport = async () => {
    const json = exportRulesJson(rules());
    try {
      await navigator.clipboard.writeText(json);
      showAppToast({ title: '已复制规则 JSON' });
    } catch {
      setImportText(json);
      showAppToast({ title: '已填入下方文本框，请手动复制' });
    }
  };

  const doImport = () => {
    try {
      const { rules: next, imported } = importRulesJson(importText());
      setRules(next);
      showAppToast({ title: `已导入 ${imported} 条规则` });
    } catch (e) {
      showAppToast({
        title: '导入失败',
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const tabItems = [
    { value: 'follow' as const, label: '追番' },
    { value: 'search' as const, label: '搜索' },
    { value: 'rules' as const, label: '规则' },
    { value: 'detail' as const, label: '详情' },
  ];

  return (
    <TvHubPageShell section="bangumi">
      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <p class="shrink-0 text-xs text-muted-foreground">{BANGUMI_ISOLATION_NOTE}</p>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <AppTabs
            value={
              (
                tab() === 'schedule' ? 'follow' : tab()
              ) as 'follow' | 'search' | 'rules' | 'detail'
            }
            onChange={(v) => {
              setTab(v as TabId);
            }}
            items={tabItems}
            ariaLabel="追番分区"
            class="min-w-0 flex-1"
          />
          <span
            class="cursor-not-allowed px-2 text-xs text-muted-foreground/60"
            title="E6.2"
          >
            时间表
          </span>
        </div>
        <div class="min-h-0 flex-1 overflow-auto">
          <Show when={tab() === 'follow'}>
            <section class="space-y-2">
              <Show when={follows().length === 0}>
                <p class="text-xs text-muted-foreground">尚无追番，可从搜索/规则加入</p>
              </Show>
              <ul class="grid gap-2 sm:grid-cols-2">
                <For each={follows()}>
                  {(f) => (
                    <li class="flex items-center justify-between gap-2 border-b border-border/60 py-2 text-sm">
                      <button
                        type="button"
                        class="min-w-0 flex-1 truncate text-left hover:underline"
                        onClick={() => void openDetail(f.ruleId, f.url)}
                      >
                        {f.title}
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        class="h-7 text-xs"
                        onClick={() => setFollows(toggleBangumiFollow(f))}
                      >
                        取消
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </Show>

          <Show when={tab() === 'search'}>
            <section class="space-y-3">
              <div class="flex flex-wrap items-end gap-2">
                <AppTextField class="min-w-[12rem] flex-1">
                  <Label class="text-xs">关键词</Label>
                  <AppTextFieldInput
                    value={keyword()}
                    onInput={(e: Event) =>
                      setKeyword((e.currentTarget as HTMLInputElement).value)
                    }
                    onKeyDown={(e: KeyboardEvent) => {
                      if (e.key === 'Enter') void runSearch();
                    }}
                  />
                </AppTextField>
                <Button
                  type="button"
                  size="sm"
                  disabled={searchBusy()}
                  onClick={() => void runSearch()}
                >
                  {searchBusy() ? '搜索中…' : '搜索'}
                </Button>
              </div>
              <ul class="space-y-1">
                <For each={searchHits()}>
                  {(h) => (
                    <li class="flex items-center justify-between gap-2 border-b border-border/40 py-1.5 text-sm">
                      <button
                        type="button"
                        class="min-w-0 flex-1 truncate text-left hover:underline"
                        onClick={() => void openDetail(h.ruleId, h.url)}
                      >
                        <span class="text-muted-foreground">[{h.ruleName}]</span> {h.title}
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        class="h-7 text-xs"
                        onClick={() => {
                          setFollows(
                            toggleBangumiFollow({
                              id: `f_${h.ruleId}_${encodeURIComponent(h.url).slice(0, 48)}`,
                              ruleId: h.ruleId,
                              title: h.title,
                              cover: h.cover,
                              url: h.url,
                            }),
                          );
                          showAppToast({ title: '已更新追番' });
                        }}
                      >
                        追番
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </Show>

          <Show when={tab() === 'rules'}>
            <section class="space-y-4">
              <div class="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void doExport()}>
                  导出 JSON
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={doImport}>
                  导入下方 JSON
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRules(upsertBangumiRule({ ...BANGUMI_EXAMPLE_RULE }));
                    showAppToast({ title: '已写入示例规则' });
                  }}
                >
                  填入示例规则
                </Button>
              </div>
              <AppTextField class="w-full">
                <Label class="text-xs">导入 / 导出缓冲</Label>
                <textarea
                  class="min-h-[5rem] w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
                  value={importText()}
                  onInput={(e) => setImportText((e.currentTarget as HTMLTextAreaElement).value)}
                  placeholder='{ "version": 2, "rules": [...] }'
                />
              </AppTextField>

              <div class="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ['name', '名称'],
                    ['baseUrl', 'baseUrl'],
                    ['userAgent', 'User-Agent'],
                    ['searchPath', 'searchPath'],
                    ['searchList', 'searchList'],
                    ['searchName', 'searchName'],
                    ['searchCover', 'searchCover'],
                    ['searchLink', 'searchLink'],
                    ['chapterList', 'chapterList'],
                    ['chapterName', 'chapterName'],
                    ['chapterLink', 'chapterLink'],
                    ['playUrl', 'playUrl'],
                  ] as const
                ).map(([key, label]) => (
                  <AppTextField class="w-full">
                    <Label class="text-xs">{label}</Label>
                    <AppTextFieldInput
                      value={(draft()[key] as string | undefined) ?? ''}
                      onInput={(e: Event) => {
                        const v = (e.currentTarget as HTMLInputElement).value;
                        setDraft((d) => ({ ...d, [key]: v }));
                      }}
                    />
                  </AppTextField>
                ))}
              </div>
              <label class="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft().enabled}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      enabled: (e.currentTarget as HTMLInputElement).checked,
                    }))
                  }
                />
                启用
              </label>
              <div class="flex gap-2">
                <Button type="button" size="sm" onClick={saveDraft}>
                  保存规则
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDraft(emptyRuleDraft())}
                >
                  新建空白
                </Button>
              </div>

              <ul class="space-y-1">
                <For each={rules()}>
                  {(r) => (
                    <li
                      class={cn(
                        'flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2 text-sm',
                        !r.enabled && 'opacity-50',
                      )}
                    >
                      <span class="min-w-0 flex-1 truncate">
                        {r.name}{' '}
                        <span class="text-xs text-muted-foreground">{r.baseUrl}</span>
                      </span>
                      <div class="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          class="h-7 text-xs"
                          onClick={() => setDraft({ ...r })}
                        >
                          编辑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          class="h-7 text-xs"
                          onClick={() => setRules(removeBangumiRule(r.id))}
                        >
                          删除
                        </Button>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </Show>

          <Show when={tab() === 'detail'}>
            <section class="space-y-3">
              <Show when={detailBusy()}>
                <p class="text-xs text-muted-foreground">加载中…</p>
              </Show>
              <Show when={!detailBusy() && !detail()}>
                <p class="text-xs text-muted-foreground">从搜索或追番进入详情</p>
              </Show>
              <Show when={detail()}>
                {(d) => (
                  <>
                    <h3 class="text-sm font-semibold">{d().title}</h3>
                    <p class="truncate text-xs text-muted-foreground">{d().url}</p>
                    <ul class="flex flex-wrap gap-1.5">
                      <For each={d().episodes}>
                        {(ep) => (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            class="h-8 text-xs"
                            onClick={() => void playEpisode(ep.url, ep.name)}
                          >
                            {ep.name}
                          </Button>
                        )}
                      </For>
                    </ul>
                    <Show when={d().episodes.length === 0}>
                      <p class="text-xs text-muted-foreground">无分集（检查 chapter* 选择器）</p>
                    </Show>
                  </>
                )}
              </Show>
            </section>
          </Show>
        </div>
      </div>
    </TvHubPageShell>
  );
}
