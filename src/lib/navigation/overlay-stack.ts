import { createSignal } from "solid-js";
import type { PageType } from "@/components/shell/Navigation";
import type { BookSource, SearchBook } from "@/types";
import type { ExploreSection } from "@/lib/book-source/explore-sections";

export type OverlayPageKind =
  | "explore"
  | "book-search"
  | "book-info"
  | "text-viewer"
  | "image-viewer"
  | "audio-viewer"
  | "video-viewer"
  | "file-viewer"
  | "remote-book";

export type ShellTabPage = Exclude<PageType, OverlayPageKind>;
export type ViewerOverlayKind =
  | "text-viewer"
  | "image-viewer"
  | "audio-viewer"
  | "video-viewer"
  | "file-viewer";

export type OverlayEntry =
  | { id: string; kind: "explore"; source: BookSource; section: ExploreSection }
  | { id: string; kind: "book-search"; initialQuery?: string; initialScope?: string; originShell: ShellTabPage }
  | { id: string; kind: "book-info"; source: BookSource; book: SearchBook; originShell: ShellTabPage }
  | { id: string; kind: ViewerOverlayKind; bookUrl: string }
  | { id: string; kind: "remote-book"; originShell: ShellTabPage };

export type OverlayEntryInput =
  | { kind: "explore"; source: BookSource; section: ExploreSection }
  | { kind: "book-search"; initialQuery?: string; initialScope?: string; originShell: ShellTabPage }
  | { kind: "book-info"; source: BookSource; book: SearchBook; originShell: ShellTabPage }
  | { kind: ViewerOverlayKind; bookUrl: string }
  | { kind: "remote-book"; originShell: ShellTabPage };

const OVERLAY_KIND_SET = new Set<OverlayPageKind>([
  "explore",
  "book-search",
  "book-info",
  "text-viewer",
  "image-viewer",
  "audio-viewer",
  "video-viewer",
  "file-viewer",
  "remote-book",
]);

let seq = 0;
const nextId = () => `overlay-${++seq}`;

/** 叠层栈内书籍 URL 比对（忽略末尾斜杠差异） */
export function normalizeOverlayBookUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  return t.replace(/\/+$/, '') || t;
}

export function isOverlayPage(page: PageType): page is OverlayPageKind {
  return OVERLAY_KIND_SET.has(page as OverlayPageKind);
}

import { normalizePageType } from "@/lib/media-shelf/compat-keys";

export function normalizeShellTab(page: string, fallback: ShellTabPage = "reader"): ShellTabPage {
  const normalized = normalizePageType(page);
  if (isOverlayPage(normalized as PageType)) return fallback;
  return normalized as ShellTabPage;
}

export function isViewerOverlayKind(kind: OverlayPageKind): kind is ViewerOverlayKind {
  return (
    kind === "text-viewer" ||
    kind === "image-viewer" ||
    kind === "audio-viewer" ||
    kind === "video-viewer" ||
    kind === "file-viewer"
  );
}

export function createOverlayStack(initialShell: ShellTabPage) {
  const [shellTab, setShellTab] = createSignal<ShellTabPage>(initialShell);
  const [entries, setEntries] = createSignal<OverlayEntry[]>([]);

  const top = () => entries()[entries().length - 1];
  const currentPage = () => (top()?.kind ?? shellTab()) as PageType;
  const isStandaloneVisible = () => entries().length > 0;

  function push(entry: OverlayEntryInput): OverlayEntry {
    const value = { ...entry, id: nextId() } as OverlayEntry;
    setEntries((prev) => [...prev, value]);
    return value;
  }

  function pop() {
    let removed: OverlayEntry | undefined;
    setEntries((prev) => {
      if (!prev.length) return prev;
      removed = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    return removed;
  }

  function popAll() {
    setEntries([]);
  }

  function popToEntryId(id: string) {
    let found = false;
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === id);
      if (idx < 0) return prev;
      found = true;
      return prev.slice(0, idx + 1);
    });
    return found;
  }

  function removeViewerKinds(...kinds: ViewerOverlayKind[]) {
    const set = new Set(kinds);
    setEntries((prev) => prev.filter((e) => !set.has(e.kind as ViewerOverlayKind)));
  }

  function findViewerEntry(kind: ViewerOverlayKind, bookUrl: string) {
    const norm = normalizeOverlayBookUrl(bookUrl);
    return entries().find(
      (e) =>
        e.kind === kind &&
        "bookUrl" in e &&
        normalizeOverlayBookUrl(e.bookUrl) === norm,
    );
  }

  function entryIsVisible(entry: OverlayEntry) {
    return top()?.id === entry.id;
  }

  function navigateShell(page: PageType) {
    if (isOverlayPage(page)) return;
    popAll();
    setShellTab(normalizeShellTab(page as string));
  }

  function bookInfoCanContinueReading() {
    const stack = entries();
    if (stack.length < 2) return false;
    const t = stack[stack.length - 1];
    const b = stack[stack.length - 2];
    return (
      t.kind === "book-info" &&
      isViewerOverlayKind(b.kind) &&
      "bookUrl" in b &&
      t.book.bookUrl === b.bookUrl
    );
  }

  function isShellActiveUnderBookInfo(shell: ShellTabPage) {
    const t = top();
    if (!t) return shellTab() === shell;
    if (t.kind === "book-info") return t.originShell === shell;
    return shellTab() === shell;
  }

  return {
    shellTab,
    entries,
    top,
    currentPage,
    isStandaloneVisible,
    push,
    pop,
    popAll,
    popToEntryId,
    removeViewerKinds,
    findViewerEntry,
    entryIsVisible,
    navigateShell,
    bookInfoCanContinueReading,
    isShellActiveUnderBookInfo,
  };
}
