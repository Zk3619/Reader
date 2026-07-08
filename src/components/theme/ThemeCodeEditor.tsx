/**
 * 主题工作室代码编辑器 — CodeMirror 6（CSS / HTML / JSON）
 * 项目已有 CodeMirror，与 Monaco 能力等价且更轻量。
 */

import { createSignal, onMount, onCleanup, createEffect, splitProps } from 'solid-js';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightActiveLine,
  drawSelection,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { cn } from '@/lib/utils';
import { getEffectiveDark } from '@/lib/theme/runtime';

export type ThemeCodeEditorLanguage = 'css' | 'html' | 'json';

export interface ThemeCodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: ThemeCodeEditorLanguage;
  class?: string;
  minHeight?: string;
  ariaLabel?: string;
}

const languageCompartment = new Compartment();
const themeCompartment = new Compartment();

function languageExtension(lang: ThemeCodeEditorLanguage): Extension {
  switch (lang) {
    case 'css':
      return css();
    case 'html':
      return javascript({ jsx: true });
    case 'json':
      return javascript();
    default:
      return [];
  }
}

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '12px' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    lineHeight: '1.55',
  },
  '.cm-content': { minHeight: '100%', padding: '8px' },
  '&.cm-focused': { outline: 'none' },
});

export function ThemeCodeEditor(props: ThemeCodeEditorProps) {
  const [local] = splitProps(props, ['value', 'onChange', 'language', 'class', 'minHeight', 'ariaLabel']);
  let mountEl: HTMLDivElement | undefined;
  const [view, setView] = createSignal<EditorView | null>(null);

  onMount(() => {
    if (!mountEl) return;
    const isDark = getEffectiveDark();
    const editorView = new EditorView({
      state: EditorState.create({
        doc: local.value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          editorTheme,
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          languageCompartment.of(languageExtension(local.language ?? 'css')),
          themeCompartment.of(isDark ? oneDark : []),
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) local.onChange?.(update.state.doc.toString());
          }),
          EditorView.contentAttributes.of({
            'aria-label': local.ariaLabel ?? '代码编辑器',
          }),
        ],
      }),
      parent: mountEl,
    });
    setView(editorView);
  });

  createEffect(() => {
    const v = view();
    const lang = local.language ?? 'css';
    if (v) {
      v.dispatch({ effects: languageCompartment.reconfigure(languageExtension(lang)) });
    }
  });

  createEffect(() => {
    const v = view();
    const val = local.value;
    if (v && v.state.doc.toString() !== val) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: val } });
    }
  });

  onCleanup(() => view()?.destroy());

  return (
    <div
      class={cn(
        'overflow-hidden rounded-md border border-input bg-background',
        local.class,
      )}
      style={{ 'min-height': local.minHeight ?? '160px' }}
    >
      <div ref={mountEl} class="h-full min-h-[inherit]" />
    </div>
  );
}
