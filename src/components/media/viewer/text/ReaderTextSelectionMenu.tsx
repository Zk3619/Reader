/**
 * 正文选区操作菜单（对标 Legado TextActionMenu）
 */

import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { MoreIcon } from '@/components/shared/icons';
import {
  findParagraphIndexForSelection,
  getSelectionClientRect,
  getSelectionPlainText,
} from '@/lib/media/text/read-aloud-selection';
import { speakSelectionOnce } from '@/lib/media/text/read-aloud';
import {
  startReadAloudSessionFromSelection,
  type ReadAloudSessionContext,
} from '@/lib/media/text/read-aloud-session';
import {
  copySelectionText,
  openProcessTextApp,
  openSelectionInBrowser,
  shareSelectionText,
} from '@/lib/media/text/reader-text-menu-actions';
import {
  labelForTextMenuEntry,
  resolveTextMenuEntries,
  splitTextMenuEntriesForCollapsed,
  type TextViewerTextMenuEntry,
} from '@/lib/media/text/reader-text-menu-config';
import type { TextViewerTextMenuItemId } from '@/lib/media/text/reader-ui-config';
import { textViewerStore } from '@/stores/viewer';
import { getHttpTTS } from '@/lib/database/http-tts';
import { isSelectionAnchorInReaderContent } from '@/lib/media/text/reader-text-selection-shared';
import {
  clearDocumentTextSelection,
  READER_TEXT_SELECTION_CLEARED_EVENT,
} from '@/lib/media/text/reader-text-selection-gesture';
import { cn } from '@/lib/utils';

export type ReaderTextSelectionMenuActions = {
  onReplace?: (text: string) => void;
  onBookmark?: (text: string) => void | Promise<void>;
  onDict?: (text: string) => void;
  onSearchContent?: (text: string) => void;
};

export interface ReaderTextSelectionMenuProps {
  sessionContext: ReadAloudSessionContext;
  contentRootRef?: () => HTMLElement | null;
  actions?: ReaderTextSelectionMenuActions;
}

function MenuButton(props: {
  label: string;
  onClick: () => void;
  class?: string;
}) {
  return (
    <Button
      size="sm"
      variant="secondary"
      class={cn('h-8 shrink-0 text-xs', props.class)}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        props.onClick();
      }}
    >
      {props.label}
    </Button>
  );
}

export function ReaderTextSelectionMenu(props: ReaderTextSelectionMenuProps) {
  const [rect, setRect] = createSignal<ReturnType<typeof getSelectionClientRect>>(null);
  const [moreOpen, setMoreOpen] = createSignal(false);

  const updateSelection = () => {
    if (textViewerStore.state.config.selectText === false) {
      setRect(null);
      return;
    }
    if (typeof window !== 'undefined') {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || sel.toString().length === 0) {
        setRect(null);
        return;
      }
    }
    const text = getSelectionPlainText();
    if (!text) {
      setRect(null);
      return;
    }
    if (!isSelectionAnchorInReaderContent()) {
      setRect(null);
      return;
    }
    setRect(getSelectionClientRect());
  };

  onMount(() => {
    const onSelectionCleared = () => {
      setRect(null);
      setMoreOpen(false);
    };
    document.addEventListener('selectionchange', updateSelection);
    document.addEventListener(READER_TEXT_SELECTION_CLEARED_EVENT, onSelectionCleared);
    document.addEventListener('mouseup', updateSelection);
    onCleanup(() => {
      document.removeEventListener('selectionchange', updateSelection);
      document.removeEventListener(READER_TEXT_SELECTION_CLEARED_EVENT, onSelectionCleared);
      document.removeEventListener('mouseup', updateSelection);
    });
  });

  const menuEntries = () => resolveTextMenuEntries(textViewerStore.state.config);

  const layoutEntries = () => {
    const entries = menuEntries();
    if (textViewerStore.state.config.expandTextMenu) {
      return { primary: entries, more: [] as TextViewerTextMenuEntry[], expanded: true };
    }
    const split = splitTextMenuEntriesForCollapsed(entries);
    return { ...split, expanded: false };
  };

  const finishMenuAction = () => {
    clearDocumentTextSelection();
    setMoreOpen(false);
  };

  const buildSpeakOptions = async () => {
    const cfg = textViewerStore.state.config;
    const httpTts =
      cfg.aloudEngine === 'httpTts' && cfg.httpTtsId != null
        ? await getHttpTTS(cfg.httpTtsId)
        : null;
    return {
      engine: cfg.aloudEngine,
      httpTts,
      ttsSpeechRate: cfg.ttsSpeechRate,
      speakSpeed: cfg.speakSpeed,
      ttsFollowSys: cfg.ttsFollowSys,
      voiceURI: cfg.systemTtsVoiceURI || undefined,
      lang: cfg.systemTtsLang || 'zh-CN',
    };
  };

  const handleSpeakSelection = async () => {
    const text = getSelectionPlainText();
    if (!text) return;
    const opts = await buildSpeakOptions();
    void speakSelectionOnce(text, opts);
    finishMenuAction();
  };

  const handleSpeakFromHere = async () => {
    const text = getSelectionPlainText();
    if (!text) return;
    const content = textViewerStore.state.content;
    const idx = findParagraphIndexForSelection(content, text);
    clearDocumentTextSelection();
    setMoreOpen(false);
    void startReadAloudSessionFromSelection(props.sessionContext, idx);
  };

  const runBuiltinItem = (id: TextViewerTextMenuItemId) => {
    const text = getSelectionPlainText();
    if (!text) return;
    switch (id) {
      case 'replace':
        props.actions?.onReplace?.(text);
        finishMenuAction();
        break;
      case 'copy':
        void copySelectionText(text).then((ok) => {
          if (ok) finishMenuAction();
        });
        break;
      case 'bookmark':
        void Promise.resolve(props.actions?.onBookmark?.(text)).then(() => finishMenuAction());
        break;
      case 'speakSelection':
        void handleSpeakSelection();
        break;
      case 'speakFromHere':
        void handleSpeakFromHere();
        break;
      case 'dict':
        props.actions?.onDict?.(text);
        finishMenuAction();
        break;
      case 'searchContent':
        props.actions?.onSearchContent?.(text);
        finishMenuAction();
        break;
      case 'browser':
        void openSelectionInBrowser(text).then(() => finishMenuAction());
        break;
      case 'share':
        void shareSelectionText(text).then(() => finishMenuAction());
        break;
      default:
        break;
    }
  };

  const runEntry = (entry: TextViewerTextMenuEntry) => {
    if (entry.kind === 'builtin') {
      runBuiltinItem(entry.id);
      return;
    }
    const text = getSelectionPlainText();
    if (!text) return;
    void openProcessTextApp(entry.urlTemplate, text).then(() => finishMenuAction());
  };

  const pos = () => {
    const r = rect();
    if (!r) return null;
    const cfg = textViewerStore.state.config;
    const expanded = cfg.expandTextMenu === true;
    const offset = expanded ? 52 : 44;
    return {
      top: Math.max(8, r.top - offset),
      left: Math.max(8, Math.min(window.innerWidth - 8, r.left + r.width / 2)),
    };
  };

  return (
    <Show when={rect() && pos()}>
      {(p) => {
        const layout = layoutEntries();
        return (
          <div
            class={cn(
              'pointer-events-auto fixed z-[calc(var(--viewer-chrome-z,50)+2)] max-w-[min(calc(100dvw-16px),42rem)] -translate-x-1/2 rounded-lg border border-border/70 bg-background/95 p-1 shadow-lg backdrop-blur-sm',
              layout.expanded && 'flex flex-wrap items-center justify-center gap-1',
              !layout.expanded && 'flex items-center gap-1',
            )}
            data-reader-text-selection-menu=""
            style={{
              top: `${p().top}px`,
              left: `${p().left}px`,
            }}
            role="toolbar"
            aria-label="选区菜单"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <For each={layout.primary}>
              {(entry) => (
                <MenuButton
                  label={labelForTextMenuEntry(entry)}
                  onClick={() => runEntry(entry)}
                />
              )}
            </For>
            <Show when={!layout.expanded && layout.more.length > 0}>
              <AppDropdownMenu open={moreOpen()} onOpenChange={setMoreOpen} disableAccessibilityAnnounce>
                <AppDropdownMenuTrigger
                  as={(triggerProps: { class?: string }) => (
                    <AppDropdownMenuIconTrigger
                      triggerProps={triggerProps}
                      class="h-8 w-8 shrink-0"
                      aria-label="更多"
                      onPointerDown={(e: PointerEvent) => e.stopPropagation()}
                    >
                      <MoreIcon class="h-4 w-4" />
                    </AppDropdownMenuIconTrigger>
                  )}
                />
                <AppDropdownMenuContent align="start" class="min-w-36">
                  <For each={layout.more}>
                    {(entry) => (
                      <AppDropdownMenuItem onSelect={() => runEntry(entry)}>
                        {labelForTextMenuEntry(entry)}
                      </AppDropdownMenuItem>
                    )}
                  </For>
                </AppDropdownMenuContent>
              </AppDropdownMenu>
            </Show>
          </div>
        );
      }}
    </Show>
  );
}
