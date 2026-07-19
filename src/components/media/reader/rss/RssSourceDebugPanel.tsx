/**
 * RSS 源调试面板（对齐 Legado RssSourceDebugActivity + SourceDebugPanel）
 */

import { For, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import type { RssSourceDebugSnapshots } from '@/lib/rss-source/rss-source-debug';
import type { RssSourceDebugPanelStore } from '@/lib/rss-source/rss-source-debug-panel-store';
import type { RssSource } from '@/types';

export interface RssSourceDebugPanelProps {
  store: RssSourceDebugPanelStore;
  source: () => RssSource | null;
  onBeforeDebug?: () => Promise<RssSource | null>;
  checkKeyword?: () => string;
}

interface DebugHelpSection {
  title: string;
  hint: string;
  examples?: string[];
}

const DEBUG_HELP: DebugHelpSection[] = [
  {
    title: '调试搜索',
    hint: '输入关键字（需配置 searchUrl），如：',
    examples: ['我的', '系统'],
  },
  {
    title: '调试分类',
    hint: '输入 分类名::URL，如：',
    examples: ['推荐::https://example.com/rss'],
  },
  {
    title: '调试内容页',
    hint: '输入文章链接，如：',
    examples: ['https://example.com/article/1'],
  },
  {
    title: '解析分类',
    hint: '留空后点击开始，解析 sortUrl / JS 分类',
  },
];

const LOG_LINE_CLASS = 'whitespace-pre-wrap break-all [overflow-wrap:anywhere]';
const LOG_TIMESTAMP_RE = /^\[(\d{2}:\d{2}\.\d{3})\]\s*/;

function parseDebugLogLine(text: string): { time: string | null; body: string } {
  let rest = text;
  let time: string | null = null;
  const first = rest.match(LOG_TIMESTAMP_RE);
  if (first) {
    time = `[${first[1]}]`;
    rest = rest.slice(first[0].length);
    const second = rest.match(LOG_TIMESTAMP_RE);
    if (second) rest = rest.slice(second[0].length);
  }
  return { time, body: rest };
}

function logBodyClass(state: number): string {
  if (state < 0) return 'text-destructive/85';
  if (state >= 1000) return 'text-emerald-700/90 dark:text-emerald-400/90';
  return 'text-foreground/85';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function DebugLogLine(props: { state: number; text: string }) {
  const parsed = () => parseDebugLogLine(props.text);
  return (
    <p class="flex gap-1.5 py-0.5 text-[13px] leading-[1.55]">
      <Show when={parsed().time}>
        <span class="w-14 shrink-0 pt-px text-right font-mono text-[10px] leading-[1.55] tabular-nums text-muted-foreground/65">
          {parsed().time}
        </span>
      </Show>
      <span
        class={`min-w-0 flex-1 ${LOG_LINE_CLASS} ${logBodyClass(props.state)} ${
          props.state >= 1000 ? 'font-medium' : ''
        }`}
      >
        {parsed().body || props.text}
      </span>
    </p>
  );
}

export function RssSourceDebugPanel(props: RssSourceDebugPanelProps) {
  const store = () => props.store;

  const resolveCheckKeyword = () => {
    const fromProps = props.checkKeyword?.();
    if (fromProps) return fromProps;
    return '我的';
  };

  function applyKeyword(value: string) {
    store().setKeyword(value);
    store().setHelpOpen(false);
  }

  function viewSnapshot(which: keyof RssSourceDebugSnapshots, label: string) {
    const html = store().snapshots()[which];
    if (!html?.trim()) {
      store().appendLog(0, `暂无${label}源码（请先完成对应阶段的本地调试）`);
      return;
    }
    const w = window.open('', '_blank');
    if (!w) return;
    const looksLikeHtml = /<(?:html|body|div|table|!DOCTYPE)/i.test(html.slice(0, 800));
    if (looksLikeHtml) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    } else {
      w.document.write(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${label}</title></head><body><pre style="white-space:pre-wrap;word-break:break-all;padding:12px;font-family:monospace;font-size:13px">${escapeHtml(html)}</pre></body></html>`,
      );
      w.document.close();
    }
  }

  const firstSortExample = () => {
    const sections = store().sortSections();
    if (sections.length === 0) return null;
    const first = sections[0];
    if (!first.url) return null;
    return { label: first.name || '默认', value: `${first.name}::${first.url}` };
  };

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      <div class="min-h-0 min-w-0 shrink-0 overflow-y-auto overflow-x-hidden overscroll-contain max-h-[min(52vh,420px)] scroll-gutter-stable-both">
        <div class="flex min-w-0 flex-col gap-3 pr-0.5">
          <div class="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              class="h-8"
              onClick={() => store().setHelpOpen((v) => !v)}
            >
              {store().helpOpen() ? '收起帮助' : '调试帮助'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              class="h-8"
              disabled={store().running()}
              onClick={() => void store().refreshSortSections(props.source())}
            >
              刷新分类
            </Button>
            <Button
              size="sm"
              variant="outline"
              class="h-8"
              onClick={() => viewSnapshot('listHtml', '列表页')}
            >
              列表 HTML
            </Button>
            <Button
              size="sm"
              variant="outline"
              class="h-8"
              onClick={() => viewSnapshot('contentHtml', '内容页')}
            >
              内容 HTML
            </Button>
          </div>

          <div class="flex flex-wrap gap-2">
            <AppTextField class="min-w-0 flex-1">
              <AppTextFieldInput
                placeholder="留空解析分类；关键字搜索；分类::URL；http 链接拉正文"
                value={store().keyword()}
                onInput={(e) => store().setKeyword(e.currentTarget.value)}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    void store().runDebug(props.source(), {
                      onBeforeDebug: props.onBeforeDebug,
                    });
                  }
                }}
              />
            </AppTextField>
            <Button
              disabled={store().running() || !props.source()}
              onClick={() =>
                void store().runDebug(props.source(), { onBeforeDebug: props.onBeforeDebug })
              }
            >
              {store().running() ? '调试中…' : '开始'}
            </Button>
            <Button
              variant="outline"
              disabled={!store().running()}
              onClick={() => store().stopAll()}
            >
              停止
            </Button>
            <Button variant="outline" onClick={() => store().clearLogs()}>
              清空
            </Button>
          </div>

          <Show when={store().helpOpen()}>
            <div class="min-w-0 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
              <For each={DEBUG_HELP}>
                {(section) => (
                  <div class="min-w-0 space-y-1.5">
                    <p class="font-medium text-foreground">{section.title}</p>
                    <p class="text-muted-foreground">{section.hint}</p>
                    <div class="flex min-w-0 flex-wrap gap-1.5">
                      <Show when={section.title === '调试搜索'}>
                        <Button
                          size="sm"
                          variant="outline"
                          class="h-7 px-2 text-xs"
                          onClick={() => applyKeyword(resolveCheckKeyword())}
                        >
                          {resolveCheckKeyword()}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          class="h-7 px-2 text-xs"
                          onClick={() => applyKeyword('系统')}
                        >
                          系统
                        </Button>
                      </Show>
                      <Show when={section.title === '调试分类'}>
                        <Show
                          when={firstSortExample()}
                          fallback={
                            <span class={`${LOG_LINE_CLASS} text-muted-foreground`}>
                              {store().sortError() ?? '暂无分类，请配置 sortUrl'}
                            </span>
                          }
                        >
                          {(example) => (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                class="h-auto min-h-7 max-w-full whitespace-normal px-2 py-1 text-left text-xs"
                                title={example().value}
                                onClick={() => applyKeyword(example().value)}
                              >
                                {example().label}
                              </Button>
                              <Show when={store().sortSections().length > 1}>
                                <For each={store().sortSections().slice(1, 8)}>
                                  {(item) => (
                                    <Show when={item.url}>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        class="h-7 max-w-full truncate px-2 text-xs"
                                        title={`${item.name}::${item.url}`}
                                        onClick={() =>
                                          applyKeyword(`${item.name}::${item.url}`)
                                        }
                                      >
                                        {item.name || '默认'}
                                      </Button>
                                    </Show>
                                  )}
                                </For>
                              </Show>
                            </>
                          )}
                        </Show>
                      </Show>
                      <Show when={section.examples}>
                        <For each={section.examples}>
                          {(ex) => (
                            <Button
                              size="sm"
                              variant="ghost"
                              class="h-7 max-w-full truncate px-2 text-xs"
                              onClick={() => applyKeyword(ex)}
                            >
                              {ex}
                            </Button>
                          )}
                        </For>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/50 bg-muted/10 p-3 font-mono">
        <Show when={store().logs().length === 0}>
          <p class="text-sm text-muted-foreground">调试日志将显示在这里</p>
        </Show>
        <For each={store().logs()}>
          {(line) => <DebugLogLine state={line.state} text={line.text} />}
        </For>
      </div>
    </div>
  );
}
