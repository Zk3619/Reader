/**
 * 首次进入阅读器时展示九宫格点击说明（对齐 Legado readHelpVersion / ClickActionConfigDialog）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';

const STORAGE_KEY = 'reader_click_action_hint_v1';
const SHOWN = 1;

export async function shouldShowClickActionHint(): Promise<boolean> {
  try {
    const v = await getStorage<number>(STORAGE_KEY);
    return v !== SHOWN;
  } catch {
    return true;
  }
}

export async function markClickActionHintShown(): Promise<void> {
  try {
    await setStorage(STORAGE_KEY, SHOWN);
  } catch (e) {
    console.warn('[reader-click-hint] persist failed', e);
  }
}
