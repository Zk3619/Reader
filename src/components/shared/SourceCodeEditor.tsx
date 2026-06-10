/**
 * 书源代码编辑器（CodeMirror 6：行号、语法高亮、主题跟随）
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
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { cn } from '@/lib/utils';
import type { SourceCodeEditorLanguage } from '@/lib/editor/source-code-language';

export interface SourceCodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: SourceCodeEditorLanguage;
  class?: string;
  readOnly?: boolean;
  ariaLabel?: string;
  minHeight?: string;
}

const languageCompartment = new Compartment();
const themeCompartment = new Compartment();
const readOnlyCompartment = new Compartment();

function languageExtension(lang: SourceCodeEditorLanguage): Extension {
  switch (lang) {
    case 'json':
      return json();
    case 'javascript':
      return javascript();
    default:
      return [];
  }
}

const lightHighlight = syntaxHighlighting(defaultHighlightStyle, { fallback: true });

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    lineHeight: '1.6',
  },
  '.cm-content': {
    minHeight: '100%',
    padding: '12px 8px',
  },
  '.cm-gutters': {
    paddingTop: '12px',
    paddingBottom: '12px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
});

function themeExtension(isDark: boolean): Extension {
  return isDark ? oneDark : lightHighlight;
}

const baseExtensions: Extension[] = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightActiveLine(),
  drawSelection(),
  dropCursor(),
  rectangularSelection(),
  crosshairCursor(),
  history(),
  keymap.of([...defaultKeymap, ...historyKeymap]),
  editorTheme,
];

export function SourceCodeEditor(props: SourceCodeEditorProps) {
  const [local] = splitProps(props, [
    'value',
    'onChange',
    'language',
    'class',
    'readOnly',
    'ariaLabel',
    'minHeight',
  ]);

  let containerRef: HTMLDivElement | undefined;
  const [view, setView] = createSignal<EditorView | null>(null);
  const [isDark, setIsDark] = createSignal(
    document.documentElement.classList.contains('dark'),
  );

  const lang = () => local.language ?? 'javascript';
  const readOnly = () => local.readOnly === true;

  onMount(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    onCleanup(() => observer.disconnect());
  });

  onMount(() => {
    if (!containerRef) return;

    const editorView = new EditorView({
      state: EditorState.create({
        doc: local.value,
        extensions: [
          ...baseExtensions,
          languageCompartment.of(languageExtension(lang())),
          themeCompartment.of(themeExtension(isDark())),
          readOnlyCompartment.of(EditorView.editable.of(!readOnly())),
          EditorView.contentAttributes.of({
            'aria-label': local.ariaLabel ?? '代码编辑器',
          }),
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
              local.onChange?.(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: containerRef,
    });
    setView(editorView);

    onCleanup(() => {
      editorView.destroy();
      setView(null);
    });
  });

  createEffect(() => {
    const editorView = view();
    if (!editorView) return;
    editorView.dispatch({
      effects: languageCompartment.reconfigure(languageExtension(lang())),
    });
  });

  createEffect(() => {
    const editorView = view();
    if (!editorView) return;
    editorView.dispatch({
      effects: themeCompartment.reconfigure(themeExtension(isDark())),
    });
  });

  createEffect(() => {
    const editorView = view();
    if (!editorView) return;
    editorView.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorView.editable.of(!readOnly())),
    });
  });

  createEffect(() => {
    const editorView = view();
    if (!editorView) return;
    const external = local.value;
    const current = editorView.state.doc.toString();
    if (external !== current) {
      editorView.dispatch({
        changes: { from: 0, to: current.length, insert: external },
      });
    }
  });

  return (
    <div
      ref={containerRef}
      class={cn(
        'h-full min-h-0 overflow-hidden rounded-md border border-input bg-background',
        local.class,
      )}
      style={{ 'min-height': local.minHeight ?? '12rem' }}
      role="textbox"
      aria-label={local.ariaLabel ?? '代码编辑器'}
      aria-multiline="true"
    />
  );
}
