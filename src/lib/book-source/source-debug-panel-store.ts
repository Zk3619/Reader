/**
 * 书源调试面板共享状态（窄屏 / 宽屏两套布局共用同一实例）
 */

import { createSignal } from 'solid-js';
import {
  cancelBookSourceDebug,
  BOOK_SOURCE_DEBUG_HIDDEN_STATES,
  type BookSourceDebugSnapshots,
} from '@/lib/book-source/book-source-debug';
import { cancelBookSourceDebugRemote } from '@/lib/book-source/book-source-debug-remote';
import {
  parseLegadoHttpAndWebSocketUrls,
  readLegadoWebHttpEntry,
} from '@/lib/book-source/legado-web-endpoint';
import { shortenBookSourceDebugText } from '@/lib/book-source/book-source-debug-hook';
import {
  clearExploreSectionsCache,
  getExploreSectionsAsync,
  type ExploreSection,
} from '@/lib/book-source/explore-sections';
import type { BookSource } from '@/types';

export type SourceDebugMode = 'local' | 'remote';

export interface SourceDebugLogLine {
  state: number;
  text: string;
}

export function createSourceDebugPanelStore(initialKeyword = '我的') {
  const [keyword, setKeyword] = createSignal(initialKeyword);
  const [logs, setLogs] = createSignal<SourceDebugLogLine[]>([]);
  const [running, setRunning] = createSignal(false);
  const [snapshots, setSnapshots] = createSignal<BookSourceDebugSnapshots>({});
  const [debugMode, setDebugMode] = createSignal<SourceDebugMode>('local');
  const [httpEntry, setHttpEntry] = createSignal('http://127.0.0.1:1234');
  const [wsEntry, setWsEntry] = createSignal('');
  const [helpOpen, setHelpOpen] = createSignal(true);
  const [exploreSections, setExploreSections] = createSignal<ExploreSection[]>([]);
  const [exploreError, setExploreError] = createSignal<string | null>(null);
  const [httpReady, setHttpReady] = createSignal(false);

  let exploreLoadSeq = 0;

  function appendLog(state: number, text: string) {
    if (!text.trim() && state === 1) return;
    if (BOOK_SOURCE_DEBUG_HIDDEN_STATES.has(state)) return;
    setLogs((prev) => [...prev, { state, text: shortenBookSourceDebugText(text, 240) }]);
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

  async function initHttp() {
    if (httpReady()) return;
    const http = await readLegadoWebHttpEntry();
    setHttpEntry(http);
    setWsEntry(parseLegadoHttpAndWebSocketUrls(http)[1]);
    setHttpReady(true);
  }

  async function loadExploreSections(source: BookSource | null) {
    const seq = ++exploreLoadSeq;
    if (!source) {
      setExploreSections([]);
      setExploreError(null);
      return;
    }
    try {
      const sections = (await getExploreSectionsAsync(source)).filter((s) => s.url?.trim());
      if (seq !== exploreLoadSeq) return;
      setExploreSections(sections);
      const err = sections.find((s) => s.title?.startsWith('ERROR:'));
      setExploreError(err ? `获取发现出错\n${err.url ?? ''}` : null);
    } catch (e) {
      if (seq !== exploreLoadSeq) return;
      setExploreSections([]);
      setExploreError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refreshExplore(source: BookSource | null) {
    if (source) clearExploreSectionsCache(source.sourceUrl);
    setExploreError(null);
    await loadExploreSections(source);
    setHelpOpen(true);
  }

  function dispose() {
    stopAll();
  }

  return {
    keyword,
    setKeyword,
    logs,
    setLogs,
    running,
    setRunning,
    snapshots,
    setSnapshots,
    debugMode,
    setDebugMode,
    httpEntry,
    setHttpEntry,
    wsEntry,
    setWsEntry,
    helpOpen,
    setHelpOpen,
    exploreSections,
    exploreError,
    appendLog,
    stopAll,
    updateHttpEntry,
    initHttp,
    loadExploreSections,
    refreshExplore,
    dispose,
  };
}

export type SourceDebugPanelStore = ReturnType<typeof createSourceDebugPanelStore>;
