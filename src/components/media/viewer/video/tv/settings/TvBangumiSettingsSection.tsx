/**
 * 影视设置 → 番剧分区
 */

import { For, createSignal, createMemo } from 'solid-js';
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
import {
  BANGUMI_EXAMPLE_RULE,
  BANGUMI_ISOLATION_NOTE,
  exportRulesJson,
  importRulesJson,
  loadBangumiRules,
  removeBangumiRule,
  upsertBangumiRule,
  type BangumiRule,
} from '@/lib/media/video/bangumi/rules';
import { importKazumiRulesJson } from '@/lib/media/video/bangumi/kazumi-adapter';
import { updateAllBangumiRuleSubscriptions } from '@/lib/media/video/bangumi/subscription';
import {
  BANGUMI_RULE_API_LEVEL,
  addBangumiRuleSubscribeUrl,
  getBangumiModulePrefs,
  removeBangumiRuleSubscribeUrl,
  setBangumiModulePrefs,
  type BangumiResolveMode,
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

export function TvBangumiSettingsSection() {
  const [rulesTick, setRulesTick] = createSignal(0);
  const [subUrl, setSubUrl] = createSignal('');
  const [importText, setImportText] = createSignal('');
  const [prefsTick, setPrefsTick] = createSignal(0);
  const rules = createMemo(() => {
    rulesTick();
    return loadBangumiRules();
  });
  const prefs = createMemo(() => {
    prefsTick();
    return getBangumiModulePrefs();
  });
  const metaPrefs = createMemo(() => {
    prefsTick();
    return getBangumiMetaPrefs();
  });

  function refresh() {
    setRulesTick((n) => n + 1);
    setPrefsTick((n) => n + 1);
  }

  async function doImport() {
    const text = importText().trim();
    if (!text) return;
    try {
      let imported = 0;
      try {
        const kz = importKazumiRulesJson(text);
        for (const r of kz.rules) upsertBangumiRule(r);
        imported = kz.imported;
        if (kz.skipped.length) {
          void showAppToast({
            title: '部分跳过',
            description: kz.skipped.slice(0, 3).join('；'),
            variant: 'warning',
          });
        }
      } catch {
        imported = 0;
      }
      if (!imported) {
        imported = importRulesJson(text).imported;
      }
      setImportText('');
      refresh();
      void showAppToast({ title: `已导入 ${imported} 条规则`, variant: 'success' });
    } catch (e) {
      void showAppToast({
        title: '导入失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  return (
    <div class="space-y-4 border-t border-border/60 pt-4">
      <div>
        <h3 class="text-sm font-semibold">番剧</h3>
        <p class="text-xs text-muted-foreground">{BANGUMI_ISOLATION_NOTE}</p>
        <p class="text-xs text-muted-foreground">规则 apiLevel ≤ {BANGUMI_RULE_API_LEVEL}</p>
      </div>

      <div class="space-y-2">
        <Label class="text-xs">Bangumi API 镜像</Label>
        <div class="flex items-center gap-2">
          <AppSwitch
            checked={metaPrefs().useMirror}
            onChange={(c) => {
              setBangumiMetaPrefs({ useMirror: c });
              refresh();
            }}
          >
            <AppSwitchControl>
              <AppSwitchThumb />
            </AppSwitchControl>
          </AppSwitch>
          <span class="text-xs">使用镜像（{metaPrefs().mirrorBase}）</span>
        </div>
      </div>

      <div class="space-y-2">
        <Label class="text-xs">抽流模式</Label>
        <AppSelect
          value={prefs().resolveMode}
          onChange={(v) => {
            if (v === 'auto' || v === 'static' || v === 'webview') {
              setBangumiModulePrefs({ resolveMode: v as BangumiResolveMode });
              refresh();
            }
          }}
          options={['auto', 'static', 'webview']}
          itemComponent={(p) => (
            <AppSelectItem item={p.item}>{String(p.item.rawValue)}</AppSelectItem>
          )}
        >
          <AppSelectTrigger layout="form" class="h-9" aria-label="抽流模式">
            <AppSelectValue>{() => prefs().resolveMode}</AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectListbox />
          </AppSelectContent>
        </AppSelect>
      </div>

      <div class="space-y-2">
        <Label class="text-xs">弹幕过滤关键词（逗号分隔）</Label>
        <AppTextField>
          <AppTextFieldInput
            value={prefs().danmakuBlockKeywords.join(',')}
            onChange={(e: Event & { currentTarget: HTMLInputElement }) => {
              const arr = e.currentTarget.value
                .split(/[,，\n]/)
                .map((s: string) => s.trim())
                .filter(Boolean);
              setBangumiModulePrefs({ danmakuBlockKeywords: arr });
              refresh();
            }}
          />
        </AppTextField>
        <div class="flex items-center gap-2">
          <AppSwitch
            checked={prefs().enableDanmakuSend}
            onChange={(c) => {
              setBangumiModulePrefs({ enableDanmakuSend: c });
              refresh();
            }}
          >
            <AppSwitchControl>
              <AppSwitchThumb />
            </AppSwitchControl>
          </AppSwitch>
          <span class="text-xs">允许弹幕发送（需弹弹密钥）</span>
        </div>
      </div>

      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="text-xs font-semibold">规则列表（{rules().length}）</h4>
          <div class="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                upsertBangumiRule({ ...BANGUMI_EXAMPLE_RULE, id: `demo_${Date.now()}` });
                refresh();
              }}
            >
              示例规则
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(exportRulesJson());
                void showAppToast({ title: '已复制导出 JSON', variant: 'success' });
              }}
            >
              导出
            </Button>
          </div>
        </div>
        <ul class="max-h-40 space-y-1 overflow-auto text-xs">
          <For each={rules()}>
            {(r: BangumiRule) => (
              <li class="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1">
                <span class="truncate">
                  {r.enabled ? '' : '[关] '}
                  {r.name}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  class="h-7"
                  onClick={() => {
                    removeBangumiRule(r.id);
                    refresh();
                  }}
                >
                  删
                </Button>
              </li>
            )}
          </For>
        </ul>
        <Label class="text-xs">粘贴导入（Reader / Kazumi JSON）</Label>
        <textarea
          class="min-h-20 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
          value={importText()}
          onInput={(e) => setImportText(e.currentTarget.value)}
          placeholder='{"version":2,"rules":[...]} 或 Kazumi 插件 JSON'
        />
        <Button size="sm" onClick={() => void doImport()}>
          导入规则
        </Button>
      </div>

      <div class="space-y-2">
        <h4 class="text-xs font-semibold">规则仓库订阅</h4>
        <div class="flex gap-2">
          <AppTextField class="flex-1">
            <AppTextFieldInput
              placeholder="https://…/rules.json"
              value={subUrl()}
              onInput={(e) => setSubUrl(e.currentTarget.value)}
            />
          </AppTextField>
          <Button
            size="sm"
            onClick={() => {
              addBangumiRuleSubscribeUrl(subUrl());
              setSubUrl('');
              refresh();
            }}
          >
            添加
          </Button>
        </div>
        <ul class="space-y-1 text-xs">
          <For each={prefs().ruleSubscribeUrls}>
            {(u) => (
              <li class="flex items-center justify-between gap-2">
                <span class="truncate">{u}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  class="h-7"
                  onClick={() => {
                    removeBangumiRuleSubscribeUrl(u);
                    refresh();
                  }}
                >
                  移除
                </Button>
              </li>
            )}
          </For>
        </ul>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void updateAllBangumiRuleSubscriptions()
              .then((r) => {
                refresh();
                void showAppToast({
                  title: `订阅更新：导入 ${r.imported}`,
                  description: r.skipped.slice(0, 2).join('；') || undefined,
                  variant: 'success',
                });
              })
              .catch((e) =>
                showAppToast({
                  title: '订阅失败',
                  description: e instanceof Error ? e.message : String(e),
                  variant: 'error',
                }),
              );
          }}
        >
          更新全部订阅
        </Button>
      </div>

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
                showAppToast({ title: `已清理 ${n} 项`, variant: 'success' }),
              );
            }}
          >
            清空缓存
          </Button>
        </div>
      </div>

      <div class="space-y-2">
        <h4 class="text-xs font-semibold">收藏/历史快照（可存 WebDAV 手传）</h4>
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
                  void showAppToast({
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
