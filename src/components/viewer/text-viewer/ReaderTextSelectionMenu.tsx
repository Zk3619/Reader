/**
 * 正文选区朗读菜单（对标 Legado TextActionMenu + contentSelectSpeakMod）
 */

import { createSignal, onCleanup, onMount, Show } from 'solid-js';
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

export interface ReaderTextSelectionMenuProps {
  sessionContext: ReadAloudSessionContext;
  contentRootRef?: () => HTMLElement | null;
}

export function ReaderTextSelectionMenu(props: ReaderTextSelectionMenuProps) {
  const [rect, setRect] = createSignal<ReturnType<typeof getSelectionClientRect>>(null);

  const updateSelection = () => {
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
          aria-label="选区朗读"
        >
          <Button size="sm" variant="secondary" class="h-8 text-xs" onClick={() => void handleSpeakSelection()}>
            朗读选中
          </Button>
          <Show when={(textViewerStore.state.config.contentSelectSpeakMod ?? 0) === 1}>
            <Button size="sm" variant="secondary" class="h-8 text-xs" onClick={() => void handleSpeakFromHere()}>
              从此处朗读
            </Button>
          </Show>
        </div>
      )}
    </Show>
  );
}
