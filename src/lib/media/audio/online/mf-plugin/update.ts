/**
 * MusicFree 插件远程更新
 */

import { request } from '@/lib/http';
import {
  importMfPlugin,
  listMfPlugins,
  type MfPluginRecord,
} from '@/lib/media/audio/online/mf-plugin';

export type MfPluginUpdateInfo = {
  id: string;
  name: string;
  currentVersion?: string;
  remoteVersion?: string;
  srcUrl: string;
  hasUpdate: boolean;
  error?: string;
};

function parseVersionFromScript(script: string): string | undefined {
  const m = script.match(/version\s*:\s*['"]([^'"]+)['"]/);
  return m?.[1]?.trim();
}

export async function checkMfPluginUpdate(plugin: MfPluginRecord): Promise<MfPluginUpdateInfo> {
  const srcUrl = plugin.srcUrl?.trim();
  if (!srcUrl) {
    return {
      id: plugin.id,
      name: plugin.name,
      currentVersion: plugin.version,
      srcUrl: '',
      hasUpdate: false,
      error: '无更新地址',
    };
  }
  try {
    const res = await request(srcUrl, {
      method: 'GET',
      timeout: 30_000,
      useBackendHttp: true,
    });
    if (!res.ok) {
      return {
        id: plugin.id,
        name: plugin.name,
        currentVersion: plugin.version,
        srcUrl,
        hasUpdate: false,
        error: `HTTP ${res.status}`,
      };
    }
    const script = await res.text();
    const remoteVersion = parseVersionFromScript(script) ?? plugin.version;
    const hasUpdate =
      remoteVersion !== plugin.version ||
      script.trim() !== plugin.script.trim();
    return {
      id: plugin.id,
      name: plugin.name,
      currentVersion: plugin.version,
      remoteVersion,
      srcUrl,
      hasUpdate,
    };
  } catch (err) {
    return {
      id: plugin.id,
      name: plugin.name,
      currentVersion: plugin.version,
      srcUrl,
      hasUpdate: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkAllMfPluginUpdates(): Promise<MfPluginUpdateInfo[]> {
  const plugins = listMfPlugins().filter((p) => p.srcUrl?.trim());
  return Promise.all(plugins.map((p) => checkMfPluginUpdate(p)));
}

export async function applyMfPluginUpdate(info: MfPluginUpdateInfo): Promise<boolean> {
  if (!info.srcUrl) return false;
  const res = await request(info.srcUrl, {
    method: 'GET',
    timeout: 30_000,
    useBackendHttp: true,
  });
  if (!res.ok) return false;
  const script = await res.text();
  const result = await importMfPlugin({ script, srcUrl: info.srcUrl });
  return result.ok;
}

export async function applyAllMfPluginUpdates(
  infos?: MfPluginUpdateInfo[],
): Promise<number> {
  const list = infos ?? (await checkAllMfPluginUpdates());
  let ok = 0;
  for (const info of list) {
    if (!info.hasUpdate) continue;
    if (await applyMfPluginUpdate(info)) ok += 1;
  }
  return ok;
}
