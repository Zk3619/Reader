const DB_NAME = 'reader-fs-handles';
const DB_VERSION = 1;
const STORE = 'handles';

type StoredHandle = FileSystemHandle;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export async function putHandle(id: string, handle: StoredHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getHandle(id: string): Promise<StoredHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as StoredHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function removeHandle(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 移除与给定文件名匹配的临时 file 句柄（Web 导入后可能残留） */
export async function removeFileHandlesByBaseName(fileName: string): Promise<void> {
  const db = await openDb();
  const ids = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result as string[]) ?? []);
    req.onerror = () => reject(req.error);
  });

  for (const id of ids) {
    const handle = await getHandle(id);
    if (!handle || handle.kind !== 'file') continue;
    try {
      const name = await (handle as FileSystemFileHandle).getFile().then((f) => f.name);
      if (name !== fileName) continue;
    } catch {
      /* 句柄已失效，一并清理 */
    }
    await removeHandle(id);
  }
}

export function newHandleId(): string {
  return crypto.randomUUID();
}
