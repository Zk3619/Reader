/**
 * 订阅分类名注册表：与源数据解耦，空分类亦可保留展示。
 */

import { createSignal } from 'solid-js';
import { getStorage, setStorage } from '@/lib/platform/storage';

const STORAGE_KEY = 'subscribe_category_names_v1';

const [subscribeCategoryRevision, setSubscribeCategoryRevision] = createSignal(0);
export { subscribeCategoryRevision };

function bumpSubscribeCategoryRevision(): void {
  setSubscribeCategoryRevision((n) => n + 1);
}

function normalizeNames(names: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const raw of names) {
    const name = String(raw ?? '').trim();
    if (name) set.add(name);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

async function readRegistry(): Promise<string[]> {
  try {
    const raw = await getStorage(STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return normalizeNames(raw.filter((x): x is string => typeof x === 'string'));
  } catch {
    return [];
  }
}

async function writeRegistry(names: string[]): Promise<void> {
  const next = normalizeNames(names);
  await setStorage(STORAGE_KEY, next);
  bumpSubscribeCategoryRevision();
}

/** 合并注册表与源上出现的分类（只增不减，除非显式 delete） */
export async function syncSubscribeCategoryRegistry(
  fromSources: Iterable<string>,
): Promise<string[]> {
  const registry = await readRegistry();
  const merged = normalizeNames([...registry, ...fromSources]);
  const same =
    merged.length === registry.length && merged.every((name, i) => name === registry[i]);
  if (!same) await writeRegistry(merged);
  return merged;
}

export async function listRegisteredSubscribeCategories(): Promise<string[]> {
  return readRegistry();
}

export async function ensureSubscribeCategoryNames(
  names: Iterable<string>,
): Promise<string[]> {
  return syncSubscribeCategoryRegistry(names);
}

export async function renameRegisteredSubscribeCategory(
  from: string,
  to: string,
): Promise<void> {
  const oldName = from.trim();
  const newName = to.trim();
  if (!oldName || !newName || oldName === newName) return;
  const registry = await readRegistry();
  const next = registry.map((name) => (name === oldName ? newName : name));
  await writeRegistry(next);
}

export async function removeRegisteredSubscribeCategory(name: string): Promise<void> {
  const target = name.trim();
  if (!target) return;
  const registry = await readRegistry();
  const next = registry.filter((item) => item !== target);
  if (next.length !== registry.length) await writeRegistry(next);
}
