/** 书源字段 → CodeMirror 语言（对齐 Legado CodeEditViewModel 默认 source.js） */

export type SourceCodeEditorLanguage = 'json' | 'javascript' | 'text';

const JS_FIELD_IDS = new Set([
  'loginCheckJs',
  'coverDecodeJs',
  'jsLib',
  'preUpdateJs',
  'formatJs',
  'webJs',
  'callBackJs',
  'loginUi',
  'header',
]);

export function resolveSourceFieldLanguage(fieldKey: string): SourceCodeEditorLanguage {
  if (fieldKey === 'json') return 'json';
  const id = fieldKey.includes('.') ? fieldKey.split('.').pop()! : fieldKey;
  if (JS_FIELD_IDS.has(id)) return 'javascript';
  return 'javascript';
}
