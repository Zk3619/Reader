/**
 * 统一构造 download_binary 的代理参数（跟随壳级出站代理）。
 */

import {
  resolveOutboundProxyInvocation,
  type OutboundProxyMode,
} from '@/lib/settings/outbound-proxy';

export type DownloadBinaryProxyArgs = {
  proxy: string | null;
  proxyMode: OutboundProxyMode;
};

export function downloadBinaryProxyArgs(override?: {
  proxy?: string | null;
  proxyMode?: OutboundProxyMode | null;
  proxyUrl?: string | null;
}): DownloadBinaryProxyArgs {
  const inv = resolveOutboundProxyInvocation(override);
  return {
    proxy: inv.proxy,
    proxyMode: inv.proxyMode,
  };
}
