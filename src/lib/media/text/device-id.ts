import { getStorage, setStorage } from '@/lib/platform/storage';

const STORAGE_KEY = 'reader_device_id';

export async function getReaderDeviceId(): Promise<string> {
  const existing = await getStorage<string>(STORAGE_KEY);
  if (existing && typeof existing === 'string') return existing;
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `reader-${Date.now()}`;
  await setStorage(STORAGE_KEY, id);
  return id;
}
