/**
 * 书源调试面板（本地进程内 + Legado WebSocket 远程）
 */

import { createSignal, For, Show, onCleanup, onMount } from 'solid-js';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import {
  cancelBookSourceDebug,
  startBookSourceDebug,
  type BookSourceDebugSnapshots,
} from '@/lib/book-source/book-source-debug';
import {
  cancelBookSourceDebugRemote,
  startBookSourceDebugRemote,
} from '@/lib/book-source/book-source-debug-remote';
import {
  parseLegadoHttpAndWebSocketUrls,
  readLegadoWebHttpEntry,
  writeLegadoWebHttpEntry,
} from '@/lib/book-source/legado-web-endpoint';
import type { BookSource } from '@/types';

export type SourceDebugMode = 'local' | 'remote';

export interface SourceDebugPanelProps {
  source: () => BookSource | null;
  /** 调试前保存当前草稿 */
  onBeforeDebug?: () => Promise<BookSource | null>;
  defaultKeyword?: string;
}

interface LogLine {
  state: number;
  text: string;
}

export function SourceDebugPanel(props: SourceDebugPanelProps) {
  const [keyword, setKeyword] = createSignal(props.defaultKeyword ?? '我的');
  const [logs, setLogs] = createSignal<LogLine[]>([]);
  const [running, setRunning] = createSignal(false);
  const [snapshots, setSnapshots] = createSignal<BookSourceDebugSnapshots>({});
  const [debugMode, setDebugMode] = createSignal<SourceDebugMode>('local');
  const [httpEntry, setHttpEntry] = createSignal('http://127.0.0.1:1234');
  const [wsEntry, setWsEntry] = createSignal('');

  onMount(async () => {
    const http = await readLegadoWebHttpEntry();
    setHttpEntry(http);
    setWsEntry(parseLegadoHttpAndWebSocketUrls(http)[1]);
  });

  onCleanup(() => {
    cancelBookSourceDebug();
    cancelBookSourceDebugRemote();
  });

  function appendLog(state: number, text: string) {
    setLogs((prev) => [...prev, { state, text }]);
  }

  function stopAll() {
    cancelBookSourceDebug();
    cancelBookSourceDebugRemote();
    setRunning(false);
  }

  function updateHttpEntry(value: string) {
    setHttpEntry(value);
    const [, ws] = parseLegadoHttpAndWebSocketUrls(value);
    setWsEntry(ws);
  }

  async function runDebug() {
    const key = keyword().trim();
    if (!key) return;

    let source = props.source();
    if (props.onBeforeDebug) {
      source = (await props.onBeforeDebug()) ?? source;
    }
    if (!source?.sourceUrl?.trim()) {
      setLogs([{ state: -1, text: '请先填写源域名并保存，或确保书源有效' }]);
      return;
    }

    stopAll();
    setRunning(true);
    setLogs([]);
    setSnapshots({});

    if (debugMode() === 'remote') {
      const http = httpEntry().trim();
      await writeLegadoWebHttpEntry(http);
      const [, ws] = parseLegadoHttpAndWebSocketUrls(http);
      setWsEntry(ws);
      appendLog(0, `连接 Legado WebSocket：${ws}`);
      appendLog(0, '远程调试需在 Legado 中已保存该书源（tag 为书源 URL）');
      startBookSourceDebugRemote(ws, source.sourceUrl, key, (text) => {
        const lines = text.split('\n').filter((l) => l.length > 0);
        for (const line of lines) {
          const isErr = /错误|失败|异常|cannot/i.test(line);
          appendLog(isErr ? -1 : 1, line);
        }
      }, () => {
        appendLog(1000, '调试结束');
        setRunning(false);
      });
      return;
    }

    await startBookSourceDebug(source, key, (state, text) => {
      appendLog(state, text);
      if (state === -1 || state === 1000) {
        setRunning(false);
      }
    }).then((snap) => {
      setSnapshots(snap);
      setRunning(false);
    });
  }

  function viewSnapshot(which: keyof BookSourceDebugSnapshots) {
    const html = snapshots()[which];
    if (!html) {
      appendLog(0, '暂无该阶段缓存内容');
      return;
    }
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(`<pre style="white-space:pre-wrap;word-break:break-all;padding:12px">${escapeHtml(html)}</pre>`);
      w.document.close();
    }
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3">
      <div class="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={debugMode() === 'local' ? 'default' : 'outline'}
          onClick={() => setDebugMode('local')}
        >
          本地调试
        </Button>
        <Button
          size="sm"
          variant={debugMode() === 'remote' ? 'default' : 'outline'}
          onClick={() => setDebugMode('remote')}
        >
          Legado 远程
        </Button>
      </div>

      <Show when={debugMode() === 'remote'}>
        <TextField>
          <TextFieldInput
            value={httpEntry()}
            onInput={(e: InputEvent) =>
              updateHttpEntry((e.currentTarget as HTMLInputElement).value)
            }
            placeholder="Legado Web 服务 HTTP 地址，如 http://192.168.1.2:1234"
          />
        </TextField>
        <p class="text-xs text-muted-foreground">WebSocket：{wsEntry() || '—'}</p>
      </Show>

      <TextField>
        <TextFieldInput
          value={keyword()}
          onInput={(e: InputEvent) => setKeyword((e.currentTarget as HTMLInputElement).value)}
          placeholder="搜索书名/作者，或 URL、分类::URL、++目录URL、--正文URL"
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') void runDebug();
          }}
        />
      </TextField>

      <div class="flex flex-wrap gap-2">
        <Button size="sm" disabled={running()} onClick={() => void runDebug()}>
          {running() ? '调试中…' : '开始调试'}
        </Button>
        <Button size="sm" variant="outline" disabled={running()} onClick={stopAll}>
          停止
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setKeyword('我的')}>
          校验词
        </Button>
      </div>

      <Show when={debugMode() === 'local'}>
        <div class="flex flex-wrap gap-1.5 text-xs">
          <Button size="sm" variant="outline" class="h-7 px-2" onClick={() => viewSnapshot('searchHtml')}>
            搜索页
          </Button>
          <Button size="sm" variant="outline" class="h-7 px-2" onClick={() => viewSnapshot('bookHtml')}>
            详情页
          </Button>
          <Button size="sm" variant="outline" class="h-7 px-2" onClick={() => viewSnapshot('tocHtml')}>
            目录页
          </Button>
          <Button size="sm" variant="outline" class="h-7 px-2" onClick={() => viewSnapshot('contentHtml')}>
            正文页
          </Button>
        </div>
      </Show>

      <div class="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
        <Show when={logs().length > 0} fallback={<p class="text-muted-foreground">调试日志将显示在这里</p>}>
          <For each={logs()}>
            {(line) => (
              <p
                class={
                  line.state < 0
                    ? 'text-destructive'
                    : line.state >= 1000
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-foreground'
                }
              >
                {line.text}
              </p>
            )}
          </For>
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
