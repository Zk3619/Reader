/**
 * 壳级出站代理（单一真相源）。
 * 模式：none | env | windows | custom；模块可 follow 或覆盖。
 */

export type OutboundProxyMode = 'none' | 'env' | 'windows' | 'custom';

export const OUTBOUND_PROXY_MODES: readonly OutboundProxyMode[] = [
  'none',
  'env',
  'windows',
  'custom',
] as const;

export const DEFAULT_OUTBOUND_PROXY_URL = '';

/** Windows 桌面默认跟系统代理；其它环境跟环境变量（与历史 reqwest 行为一致）。 */
export function defaultOutboundProxyMode(): OutboundProxyMode {
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    const platform = (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform;
    if (/Win/i.test(platform || '') || /Windows/i.test(ua)) return 'windows';
  }
  return 'env';
}

export const DEFAULT_OUTBOUND_PROXY_MODE: OutboundProxyMode = defaultOutboundProxyMode();

export type OutboundProxyConfig = {
  mode: OutboundProxyMode;
  url: string;
};

/** 传给 Rust `download_binary` / `build_client` 的解析结果 */
export type OutboundProxyInvocation = {
  proxy: string | null;
  proxyMode: OutboundProxyMode;
};

let runtimeOutbound: OutboundProxyConfig = {
  mode: DEFAULT_OUTBOUND_PROXY_MODE,
  url: DEFAULT_OUTBOUND_PROXY_URL,
};

export function normalizeOutboundProxyMode(value: unknown): OutboundProxyMode {
  if (value === 'system') return 'env'; // 旧下载配置别名
  if (
    typeof value === 'string' &&
    (OUTBOUND_PROXY_MODES as readonly string[]).includes(value)
  ) {
    return value as OutboundProxyMode;
  }
  return DEFAULT_OUTBOUND_PROXY_MODE;
}

export function normalizeOutboundProxyUrl(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_OUTBOUND_PROXY_URL;
  return value.trim().slice(0, 500);
}

export function setRuntimeOutboundProxy(value: OutboundProxyConfig): void {
  runtimeOutbound = {
    mode: normalizeOutboundProxyMode(value.mode),
    url: normalizeOutboundProxyUrl(value.url),
  };
}

export function getRuntimeOutboundProxy(): Readonly<OutboundProxyConfig> {
  return runtimeOutbound;
}

export function outboundProxyModeLabel(mode: OutboundProxyMode): string {
  switch (mode) {
    case 'none':
      return '不使用代理';
    case 'env':
      return '跟随环境变量';
    case 'windows':
      return '跟随 Windows 系统代理';
    case 'custom':
      return '自定义';
    default:
      return mode;
  }
}

/**
 * 解析一次出站调用参数。
 * - 显式非空 `proxy` → custom
 * - 显式 `proxyMode` → 该模式（custom 用 runtime/override url）
 * - 均未传 → 壳运行时默认
 */
export function resolveOutboundProxyInvocation(override?: {
  proxy?: string | null;
  proxyMode?: OutboundProxyMode | null;
  proxyUrl?: string | null;
}): OutboundProxyInvocation {
  const explicitUrl = override?.proxy?.trim() || override?.proxyUrl?.trim() || '';
  if (explicitUrl) {
    return { proxy: explicitUrl, proxyMode: 'custom' };
  }
  if (override?.proxyMode) {
    const mode = normalizeOutboundProxyMode(override.proxyMode);
    if (mode === 'custom') {
      const url = normalizeOutboundProxyUrl(override.proxyUrl ?? runtimeOutbound.url);
      return { proxy: url || null, proxyMode: 'custom' };
    }
    return { proxy: null, proxyMode: mode };
  }
  const shell = getRuntimeOutboundProxy();
  if (shell.mode === 'custom') {
    return { proxy: shell.url || null, proxyMode: 'custom' };
  }
  return { proxy: null, proxyMode: shell.mode };
}

/** 模块级：follow 用壳；否则用本模块模式 */
export type ModuleProxyMode = 'follow' | OutboundProxyMode;

export function normalizeModuleProxyMode(value: unknown): ModuleProxyMode {
  // 旧下载配置 system ≈ 环境变量；现默认跟随壳（壳可再选 env/windows）
  if (value === 'follow' || value === 'system') return 'follow';
  if (
    typeof value === 'string' &&
    (OUTBOUND_PROXY_MODES as readonly string[]).includes(value)
  ) {
    return value as OutboundProxyMode;
  }
  return 'follow';
}

export function resolveModuleOutboundProxy(module: {
  mode: ModuleProxyMode;
  url?: string | null;
}): OutboundProxyInvocation {
  if (module.mode === 'follow') {
    return resolveOutboundProxyInvocation();
  }
  return resolveOutboundProxyInvocation({
    proxyMode: module.mode,
    proxyUrl: module.url,
  });
}

/** 同步壳代理到 Rust（tv_proxy / media_convert 等无前端参数的路径） */
export async function syncShellOutboundProxyToRust(
  config: OutboundProxyConfig = getRuntimeOutboundProxy(),
): Promise<void> {
  try {
    const { isTauri } = await import('@/lib/platform/detect');
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_shell_outbound_proxy', {
      mode: config.mode,
      url: config.url || '',
    });
  } catch {
    /* 非 Tauri / 旧后端 */
  }
}
