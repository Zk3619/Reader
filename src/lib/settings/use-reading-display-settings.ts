import { createSignal, onMount } from 'solid-js';
import {
  getReadingDisplaySettings,
  saveReadingDisplaySettings,
} from '@/lib/settings/reading-display-settings';

/** 阅读显示全局设置（如同步系统亮度） */
export function useReadingDisplaySettings() {
  const [syncSystemBrightness, setSyncSystemBrightness] = createSignal(false);
  const [loading, setLoading] = createSignal(true);

  onMount(() => {
    void getReadingDisplaySettings().then((settings) => {
      setSyncSystemBrightness(settings.syncSystemBrightness);
      setLoading(false);
    });
  });

  const persistSyncSystemBrightness = (value: boolean) => {
    setSyncSystemBrightness(value);
    void saveReadingDisplaySettings({ syncSystemBrightness: value });
  };

  return {
    syncSystemBrightness,
    loading,
    persistSyncSystemBrightness,
  };
}
