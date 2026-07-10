/**
 * OpenAPI 客户端（Tauri 薄层桥接）
 */

import { isTauri } from '@/lib/platform/detect';

export async function startMusicOpenApi(port = 2333, bindIp?: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('start_music_openapi', { port, bindIp: bindIp ?? null });
}

export async function stopMusicOpenApi(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('stop_music_openapi');
}

export function registerMusicOpenApiHandler(
  handler: (action: string, payload: Record<string, unknown>) => void,
): () => void {
  if (!isTauri()) return () => undefined;
  let unlisten: (() => void) | undefined;
  void import('@tauri-apps/api/event').then(({ listen }) =>
    listen<{ action?: string; payload?: Record<string, unknown> }>(
      'music-openapi-command',
      (e) => {
        const action = e.payload?.action ?? '';
        handler(action, e.payload?.payload ?? {});
      },
    ).then((fn) => {
      unlisten = fn;
    }),
  );
  return () => unlisten?.();
}
