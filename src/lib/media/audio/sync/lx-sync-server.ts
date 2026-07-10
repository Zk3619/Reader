/**
 * LX Sync Server 协议（TS 侧，Rust 宿主 WebSocket）
 */

export interface LxSyncServerConfig {
  port: number;
  password?: string;
}

export async function startLxSyncServer(config: LxSyncServerConfig): Promise<void> {
  const { isTauri } = await import('@/lib/platform/detect');
  if (!isTauri()) throw new Error('Sync Server 仅桌面端可用');
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('start_lx_sync_server', { port: config.port, password: config.password ?? null });
}

export async function stopLxSyncServer(): Promise<void> {
  const { isTauri } = await import('@/lib/platform/detect');
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('stop_lx_sync_server');
}
