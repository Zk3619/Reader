import { createSignal, onMount } from 'solid-js';
import {
  getChapterCacheSettings,
  saveChapterCacheSettings,
} from '@/lib/chapter-cache/settings';

/** 阅读器抽屉共用的章节正文向前/向后预下载设置（全局 chapter_cache_settings） */
export function useChapterBodyPrefetchSettings() {
  const [forwardPrefetchNum, setForwardPrefetchNum] = createSignal(0);
  const [backwardPrefetchNum, setBackwardPrefetchNum] = createSignal(0);
  const [loading, setLoading] = createSignal(true);

  onMount(() => {
    void getChapterCacheSettings().then((settings) => {
      setForwardPrefetchNum(settings.forwardPrefetchNum);
      setBackwardPrefetchNum(settings.backwardPrefetchNum);
      setLoading(false);
    });
  });

  const persistForward = (value: number) => {
    setForwardPrefetchNum(value);
    void saveChapterCacheSettings({ forwardPrefetchNum: value });
  };

  const persistBackward = (value: number) => {
    setBackwardPrefetchNum(value);
    void saveChapterCacheSettings({ backwardPrefetchNum: value });
  };

  return {
    forwardPrefetchNum,
    backwardPrefetchNum,
    loading,
    persistForward,
    persistBackward,
  };
}
