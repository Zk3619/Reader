/**
 * 正文选区朗读菜单（对标 Legado TextActionMenu + contentSelectSpeakMod）
 */

import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
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
import { textViewerStore } from '@/stores/viewer';
import { getHttpTTS } from '@/lib/database/http-tts';
import {
  TEXT_VIEWER_TEXT_MENU_ITEM_LABELS,
  normalizeTextMenuVisibleItems,
  type TextViewerTextMenuItemId,
} from '@/lib/media/text/reader-ui-config';

export interface ReaderTextSelectionMenuProps {
  sessionContext: ReadAloudSessionContext;
  contentRootRef?: () => HTMLElement | null;
}

export function ReaderTextSelectionMenu(props: ReaderTextSelectionMenuProps) {
  const [rect, setRect] = createSignal<ReturnType<typeof getSelectionClientRect>>(null);

  const updateSelection = () => {
    if (textViewerStore.state.config.selectText === false) {
      setRect(null);
      return;
    }
    const text = getSelectionPlainText();
    if (!text) {
      setRect(null);
      return;
    }
    const root = props.contentRootRef?.();
    const sel = window.getSelection();
    if (root && sel?.anchorNode && !root.contains(sel.anchorNode)) {
      setRect(null);
      return;
    }
    setRect(getSelectionClientRect());
  };

  onMount(() => {
    document.addEventListener('selectionchange', updateSelection);
    document.addEventListener('mouseup', updateSelection);
    onCleanup(() => {
      document.removeEventListener('selectionchange', updateSelection);
      document.removeEventListener('mouseup', updateSelection);
    });
  });

  const visibleItems = (): TextViewerTextMenuItemId[] => {
    const cfg = textViewerStore.state.config;
    const items = normalizeTextMenuVisibleItems(cfg.textMenuVisibleItems);
    if (cfg.expandTextMenu) return items;
    return items.slice(0, 1);
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
    window.getSelection()?.removeAllRanges();
    setRect(null);
  };

  const handleSpeakFromHere = async () => {
    const text = getSelectionPlainText();
    if (!text) return;
    const content = textViewerStore.state.content;
    const idx = findParagraphIndexForSelection(content, text);
    window.getSelection()?.removeAllRanges();
    setRect(null);
    void startReadAloudSessionFromSelection(props.sessionContext, idx);
  };

  const handleCopy = () => {
    const text = getSelectionPlainText();
    if (!text) return;
    void navigator.clipboard.writeText(text).catch(() => undefined);
    window.getSelection()?.removeAllRanges();
    setRect(null);
  };

  const runItem = (id: TextViewerTextMenuItemId) => {
    switch (id) {
      case 'speakSelection':
        void handleSpeakSelection();
        break;
      case 'speakFromHere':
        void handleSpeakFromHere();
        break;
      case 'copy':
        handleCopy();
        break;
      case 'dict':
        break;
      default:
        break;
    }
  };

  const pos = () => {
    const r = rect();
    if (!r) return null;
    return {
      top: Math.max(8, r.top - 44),
      left: Math.max(8, r.left + r.width / 2),
    };
  };

  return (
    <Show when={rect() && pos()}>
      {(p) => (
        <div
          class="pointer-events-auto fixed z-[calc(var(--viewer-chrome-z,50)+2)] flex -translate-x-1/2 gap-1 rounded-lg border border-border/70 bg-background/95 p-1 shadow-lg backdrop-blur-sm"
          style={{
            top: `${p().top}px`,
            left: `${p().left}px`,
          }}
          role="toolbar"
          aria-label="选区菜单"
        >
          <For each={visibleItems()}>
            {(id) => (
              <Button
                size="sm"
                variant="secondary"
                class="h-8 text-xs"
                onClick={() => runItem(id)}
              >
                {TEXT_VIEWER_TEXT_MENU_ITEM_LABELS[id]}
              </Button>
            )}
          </For>
        </div>
      )}
    </Show>
  );
}
