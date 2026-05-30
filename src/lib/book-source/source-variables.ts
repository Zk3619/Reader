/**
 * 书源运行变量（对齐 Legado source.getVariable / setVariable → CacheManager）
 * Reader 持久化在 localStorage：reader_source_args_<书源标识>
 */

import type { BookSource, NewBookSource } from '@/types';
import {
  getSourceArgsKey,
  getSourceUrlIdentifier,
} from '@/lib/js-engine/legado/source-script-shared';
import { normalizeBookSourceServerUrl } from '@/lib/book-source/source-http';
import { bumpExploreSourceArgsVersion } from '@/stores/explore-source-args';

function parseArgsObject(raw: string | null): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const obj = JSON.parse(raw) as unknown;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return obj as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function normalizeArgsObject(obj: Record<string, unknown>): Record<string, unknown> {
  const next = { ...obj };
  if (typeof next.server === 'string' && next.server.trim()) {
    next.server = normalizeBookSourceServerUrl(next.server);
  }
  return next;
}

/** 读取用于编辑的书源变量 JSON 文本（优先 localStorage，否则 header 中的 JSON） */
export function readBookSourceVariableJson(source: BookSource): string {
  const key = getSourceArgsKey(source);
  try {
    const raw = localStorage.getItem(key);
    if (raw != null && raw !== '') {
      return JSON.stringify(parseArgsObject(raw), null, 2);
    }
  } catch {
    /* ignore */
  }
  const header = source.header;
  if (typeof header === 'string' && header.trim().startsWith('{')) {
    try {
      return JSON.stringify(JSON.parse(header) as Record<string, unknown>, null, 2);
    } catch {
      return header.trim();
    }
  }
  return '{}';
}

/** 保存书源变量（须为 JSON 对象） */
export function writeBookSourceVariableJson(source: BookSource, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) {
    localStorage.removeItem(getSourceArgsKey(source));
    bumpExploreSourceArgsVersion(getSourceUrlIdentifier(source));
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('JSON 格式无效');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('书源变量须为 JSON 对象');
  }
  const obj = normalizeArgsObject(parsed as Record<string, unknown>);
  localStorage.setItem(getSourceArgsKey(source), JSON.stringify(obj));
  bumpExploreSourceArgsVersion(getSourceUrlIdentifier(source));
}

/**
 * 导入/更新书源后：将 header 中的 JSON 字段合并进 args（仅填充空字段，不覆盖已有值）。
 * 与 Legado 在书源 JSON 的 header 字段存初始变量、运行时在「书源变量」中改写的习惯兼容。
 */
export function seedBookSourceArgsFromHeader(source: BookSource | NewBookSource): void {
  const header = source.header;
  if (typeof header !== 'string' || !header.trim().startsWith('{')) return;
  let fromHeader: Record<string, unknown>;
  try {
    const parsed = JSON.parse(header) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    fromHeader = parsed as Record<string, unknown>;
  } catch {
    return;
  }

  const asBook = source as BookSource;
  const key = getSourceArgsKey(asBook);
  const existing = parseArgsObject(localStorage.getItem(key));
  let changed = false;
  for (const [k, v] of Object.entries(fromHeader)) {
    const cur = existing[k];
    if (cur === undefined || cur === null || cur === '') {
      existing[k] = v;
      changed = true;
    }
  }
  if (!changed) return;
  localStorage.setItem(key, JSON.stringify(normalizeArgsObject(existing)));
  bumpExploreSourceArgsVersion(getSourceUrlIdentifier(asBook));
}

export function formatBookSourceVariableComment(source: BookSource): string {
  const base =
    '源变量可在 js 中通过 source.getVariable() 获取；与 Legado「设置源变量」相同。';
  const extra = source.variableComment?.trim();
  return extra ? `${extra}\n${base}` : base;
}
