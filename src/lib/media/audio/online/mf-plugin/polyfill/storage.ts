/**
 * MusicFree musicfree/storage polyfill（对齐 Desktop chunk.json + 10MB 上限）
 */

const STORAGE_KEY = 'reader_mf_plugin_storage_chunk_v1';
const MAX_STORAGE_SIZE = 1024 * 1024 * 10;

let storage: Record<string, string> = {};
let loaded = false;

function byteLengthUtf8(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return unescape(encodeURIComponent(text)).length;
}

async function saveStorage(next: Record<string, string>): Promise<void> {
  const storageString = JSON.stringify(next);
  if (byteLengthUtf8(storageString) > MAX_STORAGE_SIZE) {
    throw new Error('Storage size exceeds limit');
  }
  storage = next;
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, storageString);
  } catch (err) {
    // Node 测试 / 无 DOM：仅内存；浏览器 quota：抛出
    if (typeof localStorage === 'undefined') return;
    throw new Error(
      err instanceof Error ? err.message : 'Storage persist failed',
    );
  }
}

async function loadStorage(): Promise<Record<string, string>> {
  if (loaded) return storage;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          storage = parsed;
        }
      }
    }
  } catch {
    storage = {};
  }
  loaded = true;
  return storage;
}

async function setItem(key: string, value: unknown): Promise<void> {
  await loadStorage();
  const next = {
    ...storage,
    [key]: typeof value === 'string' ? value : value?.toString?.() ?? '',
  };
  await saveStorage(next);
}

async function getItem(key: string): Promise<string | null> {
  await loadStorage();
  return storage[key] ?? null;
}

async function removeItem(key: string): Promise<void> {
  await loadStorage();
  const next = { ...storage };
  delete next[key];
  await saveStorage(next);
}

export function resetMfPluginStorageForTests(): void {
  storage = {};
  loaded = false;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export const MF_PLUGIN_STORAGE_MAX_BYTES = MAX_STORAGE_SIZE;

const mfPluginStorage = {
  setItem,
  getItem,
  removeItem,
};

export default mfPluginStorage;
