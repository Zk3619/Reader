/**
 * Cookie Hub 调试面板：平台 Cookie 来源 / SiteScope 示例 / 是否含 cf_clearance
 */

import { For, Show, createResource, createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  clearPlatformCookies,
  describeCookieSource,
  makeDoubanScope,
  makeSubscribeScope,
  peekSharedCookieSource,
  resolveSharedCookies,
  resolveSiteCookies,
  warmCookieHub,
  type SharedPlatform,
} from '@/lib/cookie-hub';
import { showAppToast } from '@/components/shared/AppToasts';

const PLATFORMS: Array<{ id: SharedPlatform; label: string }> = [
  { id: 'netease', label: '网易云' },
  { id: 'bili', label: 'B 站' },
  { id: 'ytm', label: 'YouTube Music' },
];

function cookieHasCfClearance(cookies: string): boolean {
  return /(?:^|;\s*)cf_clearance=/i.test(cookies.trim());
}

function previewCookies(cookies: string): string {
  const t = cookies.trim();
  if (!t) return '（空）';
  if (t.length <= 64) return t;
  return `${t.slice(0, 48)}…(${t.length} chars)`;
}

export const CookieHubDebugPanel: Component = () => {
  const [tick, setTick] = createSignal(0);
  const [rows] = createResource(
    () => tick(),
    async () => {
      await warmCookieHub();
      const platforms = await Promise.all(
        PLATFORMS.map(async (p) => {
          const resolved = await resolveSharedCookies(p.id);
          return {
            kind: 'platform' as const,
            id: p.id,
            label: p.label,
            cookies: resolved.cookies,
            source: resolved.source,
            sourceLabel: describeCookieSource(resolved.source),
            hasCf: cookieHasCfClearance(resolved.cookies),
            healthy: resolved.healthy,
          };
        }),
      );

      const subscribeScope = makeSubscribeScope('https://rsshub.app/');
      const doubanScope = makeDoubanScope();
      const sites = [
        {
          kind: 'site' as const,
          id: subscribeScope.scopeKey,
          label: '订阅 · rsshub.app',
          cookies: resolveSiteCookies(subscribeScope, 'https://rsshub.app/').cookies,
          source: resolveSiteCookies(subscribeScope, 'https://rsshub.app/').source,
          sourceLabel: describeCookieSource(
            resolveSiteCookies(subscribeScope, 'https://rsshub.app/').source,
          ),
          hasCf: cookieHasCfClearance(
            resolveSiteCookies(subscribeScope, 'https://rsshub.app/').cookies,
          ),
        },
        {
          kind: 'site' as const,
          id: doubanScope.scopeKey,
          label: '影视 · 豆瓣 danmu',
          cookies: resolveSiteCookies(doubanScope, 'https://www.douban.com/').cookies,
          source: resolveSiteCookies(doubanScope, 'https://www.douban.com/').source,
          sourceLabel: describeCookieSource(
            resolveSiteCookies(doubanScope, 'https://www.douban.com/').source,
          ),
          hasCf: cookieHasCfClearance(
            resolveSiteCookies(doubanScope, 'https://www.douban.com/').cookies,
          ),
        },
      ];

      return { platforms, sites, peekBili: peekSharedCookieSource('bili') };
    },
  );

  async function clearOne(platform: SharedPlatform) {
    await clearPlatformCookies(platform);
    setTick((n) => n + 1);
    showAppToast({ title: `已清除 ${platform} Cookie Hub 状态` });
  }

  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold">Cookie Hub</h3>
          <p class="text-xs text-muted-foreground">
            平台账号与站点 scope 统一视图。书源仍按 bookSourceUrl 隔离，不在此合并。
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setTick((n) => n + 1)}>
          刷新
        </Button>
      </div>

      <Show when={rows.error}>
        <p class="text-xs text-destructive">加载失败：{String(rows.error)}</p>
      </Show>

      <div class="space-y-2">
        <div class="text-xs font-medium text-muted-foreground">平台 Cookie</div>
        <For each={rows()?.platforms ?? []}>
          {(row) => (
            <div class="rounded-lg border px-3 py-2 text-xs">
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium">{row.label}</div>
                <div class="flex items-center gap-2">
                  <span class="text-muted-foreground">{row.sourceLabel}</span>
                  <Show when={row.hasCf}>
                    <span class="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                      cf_clearance
                    </span>
                  </Show>
                  <Button size="sm" variant="ghost" class="h-7 px-2" onClick={() => void clearOne(row.id)}>
                    清除
                  </Button>
                </div>
              </div>
              <div class="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {previewCookies(row.cookies)}
              </div>
            </div>
          )}
        </For>
      </div>

      <div class="space-y-2">
        <div class="text-xs font-medium text-muted-foreground">站点 SiteScope（样例）</div>
        <For each={rows()?.sites ?? []}>
          {(row) => (
            <div class="rounded-lg border px-3 py-2 text-xs">
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium">{row.label}</div>
                <div class="flex items-center gap-2">
                  <span class="text-muted-foreground">{row.sourceLabel}</span>
                  <Show when={row.hasCf}>
                    <span class="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                      cf_clearance
                    </span>
                  </Show>
                </div>
              </div>
              <div class="mt-1 truncate font-mono text-[11px] text-muted-foreground">{row.id}</div>
              <div class="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {previewCookies(row.cookies)}
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
