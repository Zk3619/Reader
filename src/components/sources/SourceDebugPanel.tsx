/**
 * 书源调试面板（本地进程内 + Legado WebSocket 远程，对齐 Legado BookSourceDebugActivity）
 */

import { For, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import {
  startBookSourceDebug,
  type BookSourceDebugSnapshots,
} from '@/lib/book-source/book-source-debug';
import { startBookSourceDebugRemote } from '@/lib/book-source/book-source-debug-remote';
import { writeLegadoWebHttpEntry, parseLegadoHttpAndWebSocketUrls } from '@/lib/book-source/legado-web-endpoint';
import type { SourceDebugPanelStore } from '@/lib/book-source/source-debug-panel-store';
import type { BookSource } from '@/types';

export type { SourceDebugMode } from '@/lib/book-source/source-debug-panel-store';

export interface SourceDebugPanelProps {
  store: SourceDebugPanelStore;
  source: () => BookSource | null;
  /** 调试前保存当前草稿 */
  onBeforeDebug?: () => Promise<BookSource | null>;
  checkKeyword?: () => string;
}

interface DebugHelpSection {
  title: string;
  hint: string;
  examples: string[];
  prefix?: string;
}

const DEBUG_HELP: DebugHelpSection[] = [
  {
    title: '调试搜索',
    hint: '输入关键字，如：',
    examples: ['我的', '系统'],
  },
  {
    title: '调试发现',
    hint: '输入发现 URL，如：',
    examples: ['分类名::https://example.com/rank?page={{page}}'],
  },
  {
    title: '调试详情页',
    hint: '输入详情页 URL，如：',
    examples: ['https://m.qidian.com/book/1015609210'],
  },
  {
    title: '调试目录页',
    hint: '输入目录页 URL，如：',
    examples: ['++https://www.example.com/read/30394'],
    prefix: '++',
  },
  {
    title: '调试正文页',
    hint: '输入正文页 URL，如：',
    examples: ['--https://www.example.com/chapter/30394/20940996'],
    prefix: '--',
  },
];

const LOG_LINE_CLASS =
  'whitespace-pre-wrap break-all [overflow-wrap:anywhere]';

const LOG_TIMESTAMP_RE = /^\[(\d{2}:\d{2}\.\d{3})\]\s*/;

function parseDebugLogLine(text: string): { time: string | null; body: string } {
  let rest = text;
  let time: string | null = null;
  const first = rest.match(LOG_TIMESTAMP_RE);
  if (first) {
    time = `[${first[1]}]`;
    rest = rest.slice(first[0].length);
    // 兼容历史双重时间戳
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

export function SourceDebugPanel(props: SourceDebugPanelProps) {
  const store = () => props.store;

  const resolveCheckKeyword = () => {
    const fromProps = props.checkKeyword?.();
    if (fromProps) return fromProps;
    const fromRule = props.source()?.ruleSearch?.checkKeyWord?.trim();
    return fromRule || '我的';
  };

  function applyKeyword(value: string) {
    store().setKeyword(value);
    store().setHelpOpen(false);
  }

  function applyPrefix(prefix: string) {
    const current = store().keyword().trim();
    if (!current || current.length <= 2) {
      store().setKeyword(prefix);
      return;
    }
    if (!current.startsWith(prefix)) {
      store().setKeyword(`${prefix}${current}`);
    }
  }

  async function runDebug() {
    const s = store();
    const key = s.keyword().trim();
    if (!key) {
      s.appendLog(-1, '请输入调试关键词或 URL');
      return;
    }

    let source = props.source();
    if (props.onBeforeDebug) {
      source = (await props.onBeforeDebug()) ?? source;
    }
    if (!source?.sourceUrl?.trim()) {
      s.setLogs([{ state: -1, text: '请先填写源域名与源名称，或保存书源后再调试' }]);
      return;
    }

    s.stopAll();
    s.setRunning(true);
    s.setLogs([]);
    s.setSnapshots({});
    s.setHelpOpen(false);

    if (s.debugMode() === 'remote') {
      const http = s.httpEntry().trim();
      await writeLegadoWebHttpEntry(http);
      const [, ws] = parseLegadoHttpAndWebSocketUrls(http);
      s.setWsEntry(ws);
      s.appendLog(0, `连接 Legado WebSocket：${ws}`);
      s.appendLog(0, '远程调试需在 Legado 中已保存该书源（tag 为书源 URL）');
      startBookSourceDebugRemote(ws, source.sourceUrl, key, (text) => {
        const lines = text.split('\n').filter((l) => l.length > 0);
        for (const line of lines) {
          const isErr = /错误|失败|异常|cannot|未获取/i.test(line);
          s.appendLog(isErr ? -1 : 1, line);
        }
      }, () => {
        s.appendLog(1000, '调试结束');
        s.setRunning(false);
      });
      return;
    }

    await startBookSourceDebug(source, key, (state, text) => {
      s.appendLog(state, text);
      if (state === -1 || state === 1000) {
        s.setRunning(false);
      }
    }).then((snap) => {
      s.setSnapshots(snap);
      s.setRunning(false);
    });
  }

  function viewSnapshot(which: keyof BookSourceDebugSnapshots, label: string) {
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

  const firstExploreExample = () => {
    const sections = store().exploreSections();
    if (sections.length === 0) return null;
    const first = sections[0];
    if (!first.url) return null;
    return { label: first.title, value: `${first.title}::${first.url}` };
  };

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      {/* 上部控件区：可滚动，避免挤压日志区 */}
      <div class="min-h-0 min-w-0 shrink-0 overflow-y-auto overflow-x-hidden overscroll-contain max-h-[min(52vh,420px)] scroll-gutter-stable-both">
        <div class="flex min-w-0 flex-col gap-3 pr-0.5">
          <div class="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={store().debugMode() === 'local' ? 'default' : 'outline'}
              onClick={() => store().setDebugMode('local')}
            >
              本地调试
            </Button>
            <Button
              size="sm"
              variant={store().debugMode() === 'remote' ? 'default' : 'outline'}
              onClick={() => store().setDebugMode('remote')}
            >
              Legado 远程
            </Button>
            <Button
              size="sm"
              variant="ghost"
              class="h-8"
              onClick={() => store().setHelpOpen((v) => !v)}
            >
              {store().helpOpen() ? '收起帮助' : '调试帮助'}
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
                      <Show when={section.title === '调试发现'}>
                        <Show
                          when={firstExploreExample()}
                          fallback={
                            <span class={`${LOG_LINE_CLASS} text-muted-foreground`}>
                              {store().exploreError() ?? '暂无发现分类，请配置 exploreUrl'}
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
                              <Show when={store().exploreSections().length > 1}>
                                <For each={store().exploreSections().slice(1, 8)}>
                                  {(item) => (
                                    <Show when={item.url}>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        class="h-7 max-w-full truncate px-2 text-xs"
                                        title={`${item.title}::${item.url}`}
                                        onClick={() => applyKeyword(`${item.title}::${item.url}`)}
                                      >
                                        {item.title}
                                      </Button>
                                    </Show>
                                  )}
                                </For>
                              </Show>
                              <Button
                                size="sm"
                                variant="ghost"
                                class="h-7 shrink-0 px-2 text-xs"
                                onClick={() => void store().refreshExplore(props.source())}
                              >
                                刷新发现
                              </Button>
                            </>
                          )}
                        </Show>
                      </Show>
                      <Show when={section.title !== '调试搜索' && section.title !== '调试发现'}>
                        <For each={section.examples}>
                          {(ex) => (
                            <Button
                              size="sm"
                              variant="outline"
                              class="h-auto min-h-7 max-w-full whitespace-normal px-2 py-1 text-left text-xs wrap-anywhere"
                              title={ex}
                              onClick={() => applyKeyword(ex)}
                            >
                              {ex}
                            </Button>
                          )}
                        </For>
                        <Show when={section.prefix}>
                          {(prefix) => (
                            <Button
                              size="sm"
                              variant="ghost"
                              class="h-7 shrink-0 px-2 text-xs"
                              onClick={() => applyPrefix(prefix())}
                            >
                              添加 {prefix()} 前缀
                            </Button>
                          )}
                        </Show>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={store().debugMode() === 'remote'}>
            <TextField class="min-w-0">
              <TextFieldInput
                class="min-w-0"
                value={store().httpEntry()}
                onInput={(e: InputEvent) =>
                  store().updateHttpEntry((e.currentTarget as HTMLInputElement).value)
                }
                placeholder="Legado Web 服务 HTTP 地址，如 http://192.168.1.2:1234"
              />
            </TextField>
            <p class={`${LOG_LINE_CLASS} text-xs text-muted-foreground`}>
              WebSocket：{store().wsEntry() || '—'}
            </p>
          </Show>

          <TextField class="min-w-0">
            <TextFieldInput
              class="min-w-0"
              value={store().keyword()}
              onInput={(e: InputEvent) =>
                store().setKeyword((e.currentTarget as HTMLInputElement).value)
              }
              placeholder="搜索书名/作者，或 URL、分类名::URL、++目录URL、--正文URL"
              onFocus={() => store().setHelpOpen(true)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') void runDebug();
              }}
            />
          </TextField>

          <div class="flex flex-wrap gap-2">
            <Button size="sm" disabled={store().running()} onClick={() => void runDebug()}>
              {store().running() ? '调试中…' : '开始调试'}
            </Button>
            <Button size="sm" variant="outline" disabled={!store().running()} onClick={() => store().stopAll()}>
              停止
            </Button>
            <Button size="sm" variant="ghost" onClick={() => applyKeyword(resolveCheckKeyword())}>
              校验词
            </Button>
          </div>

          <Show when={store().debugMode() === 'local'}>
            <div class="flex flex-wrap gap-1.5 text-xs">
              <Button
                size="sm"
                variant="outline"
                class="h-7 px-2"
                onClick={() => viewSnapshot('searchHtml', '搜索页')}
              >
                搜索源码
              </Button>
              <Button
                size="sm"
                variant="outline"
                class="h-7 px-2"
                onClick={() => viewSnapshot('bookHtml', '详情页')}
              >
                详情源码
              </Button>
              <Button
                size="sm"
                variant="outline"
                class="h-7 px-2"
                onClick={() => viewSnapshot('tocHtml', '目录页')}
              >
                目录源码
              </Button>
              <Button
                size="sm"
                variant="outline"
                class="h-7 px-2"
                onClick={() => viewSnapshot('contentHtml', '正文页')}
              >
                正文源码
              </Button>
            </div>
          </Show>
        </div>
      </div>

      {/* 日志区：独占剩余高度，纵向滚动 */}
      <div class="min-h-32 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain rounded-lg border border-border/60 bg-background/60 py-2 pl-1.5 pr-2 shadow-inner scroll-gutter-stable-both">
        <Show
          when={store().logs().length > 0}
          fallback={
            <p class="text-[13px] leading-relaxed text-muted-foreground">
              调试日志将显示在这里（支持搜索、发现、详情、目录、正文全流程）
            </p>
          }
        >
          <div class="divide-y divide-border/40">
            <For each={store().logs()}>
              {(line) => (
                <Show when={line.text.trim().length > 0}>
                  <DebugLogLine state={line.state} text={line.text} />
                </Show>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
