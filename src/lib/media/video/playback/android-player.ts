/**
 * Android Media3 / libmpv 全屏页入口（E2）
 */

import { invoke } from '@tauri-apps/api/core';

export async function openAndroidVideoPlayer(
  engine: 'libmpv' | 'media3',
  url: string,
  title?: string,
): Promise<void> {
  await invoke('video_android_open_player', {
    engine,
    url,
    title: title ?? null,
  });
}
