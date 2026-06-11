/**
 * RSS 源调试面板状态
 */

import { createSignal } from 'solid-js';
import {
  cancelRssSourceDebug,
  startRssSourceDebug,
  type RssSourceDebugSnapshots,
} from '@/lib/rss-source/rss-source-debug';
import { parseSortUrls } from '@/lib/rss-source/sort-urls';
import type { SortUrlEntry } from '@/lib/rss-source/sort-urls';
import type { RssSource } from '@/types';

export interface RssDebugLogLine {
  state: number;
  text: string;
}

const HIDDEN_LOG_STATES = new Set([10, 20]);

export function createRssSourceDebugPanelStore(initialKeyword = '我的') {
  const [keyword, setKeyword] = createSignal(initialKeyword);
  const [logs, setLogs] = createSignal<RssDebugLogLine[]>([]);
  const [running, setRunning] = createSignal(false);
  const [sortSections, setSortSections] = createSignal<SortUrlEntry[]>([]);
  const [sortError, setSortError] = createSignal<string | null>(null);
  const [helpOpen, setHelpOpen] = createSignal(true);
  const [snapshots, setSnapshots] = createSignal<RssSourceDebugSnapshots>({});

  let runSeq = 0;

  function appendLog(state: number, text: string) {
    if (HIDDEN_LOG_STATES.has(state)) return;
    if (!text.trim() && state === 1) return;
    setLogs((prev) => [...prev, { state, text }]);
  }

  function clearLogs() {
    setLogs([]);
    setSnapshots({});
  }

  function stopAll() {
    cancelRssSourceDebug();
    runSeq++;
    setRunning(false);
  }

  async function loadSortSections(source: RssSource | null) {
    if (!source?.sourceUrl?.trim()) {
      setSortSections([]);
      setSortError(null);
      return;
    }
    try {
      const sections = await parseSortUrls(source);
      setSortSections(sections);
      setSortError(sections.length === 0 ? '未解析到分类' : null);
    } catch (e) {
      setSortSections([]);
      setSortError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refreshSortSections(source: RssSource | null) {
    await loadSortSections(source);
  }

  async function runDebug(
    source: RssSource | null,
    options?: { onBeforeDebug?: () => Promise<RssSource | null> },
  ) {
    if (running()) return;

    let resolved = source;
    if (options?.onBeforeDebug) {
      resolved = (await options.onBeforeDebug()) ?? resolved;
    }
    if (!resolved?.sourceUrl?.trim()) {
      setLogs([{ state: -1, text: '请先填写源域名与源名称，或保存后再调试' }]);
      return;
    }

    cancelRssSourceDebug();
    const seq = ++runSeq;
    setRunning(true);
    setLogs([]);
    setSnapshots({});
    setHelpOpen(false);

    try {
      const snap = await startRssSourceDebug(resolved, keyword(), appendLog);
      if (seq === runSeq) {
        setSnapshots(snap);
      }
    } catch (e) {
      if (seq === runSeq) {
        appendLog(-1, e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (seq === runSeq) setRunning(false);
    }
  }

  function dispose() {
    stopAll();
  }

  return {
    keyword,
    setKeyword,
    logs,
    running,
    sortSections,
    sortError,
    helpOpen,
    setHelpOpen,
    snapshots,
    setSnapshots,
    appendLog,
    clearLogs,
    stopAll,
    loadSortSections,
    refreshSortSections,
    runDebug,
    dispose,
  };
}

export type RssSourceDebugPanelStore = ReturnType<typeof createRssSourceDebugPanelStore>;
