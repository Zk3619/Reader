/**
 * MusicFree 插件远程更新（按 srcUrl 拉取并升级）
 */

import { request } from '@/lib/http';
import {
  importMfPlugin,
  listMfPlugins,
  type MfPluginRecord,
} from '@/lib/media/audio/online/mf-plugin';

export type MfPluginUpdateInfo = {
  pluginId: string;
  name: string;
  currentVersion?: string;
  remoteVersion?: string;
  srcUrl: string;
  hasUpdate: boolean;
  error?: string;
};

function parseVersionParts(v: string): number[] {
  return v
    .replace(/^v/i, '')
    .split(/[.\-_]/)
    .map((p) => parseInt(p, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function extractPluginVersion(script: string): string | undefined {
  const m = script.match(/version\s*:\s*['"`]([^'"`]+)['"`]/);
  return m?.[1]?.trim();
}

export async function checkMfPluginUpdate(
  plugin: Pick<MfPluginRecord, 'id' | 'name' | 'version' | 'srcUrl'>,
): Promise<MfPluginUpdateInfo> {
  const srcUrl = plugin.srcUrl?.trim();
  if (!srcUrl) {
    return {
      pluginId: plugin.id,
      name: plugin.name,
      currentVersion: plugin.version,
      srcUrl: '',
      hasUpdate: false,
      error: '无 srcUrl',
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
        pluginId: plugin.id,
        name: plugin.name,
        currentVersion: plugin.version,
        srcUrl,
        hasUpdate: false,
        error: `HTTP ${res.status}`,
      };
    }
    const script = await res.text();
    const remoteVersion = extractPluginVersion(script) ?? plugin.version;
    const hasUpdate =
      !!remoteVersion &&
      !!plugin.version &&
      compareVersions(remoteVersion, plugin.version) > 0;
    return {
      pluginId: plugin.id,
      name: plugin.name,
      currentVersion: plugin.version,
      remoteVersion,
      srcUrl,
      hasUpdate,
    };
  } catch (err) {
    return {
      pluginId: plugin.id,
      name: plugin.name,
      currentVersion: plugin.version,
      srcUrl,
      hasUpdate: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkAllMfPluginUpdates(): Promise<MfPluginUpdateInfo[]> {
  const plugins = listMfPlugins().filter((p) => p.enabled && p.srcUrl?.trim());
  const results: MfPluginUpdateInfo[] = [];
  for (const p of plugins) {
    results.push(await checkMfPluginUpdate(p));
  }
  return results;
}

export async function applyMfPluginUpdate(
  _pluginId: string,
  srcUrl: string,
): Promise<{ ok: boolean; error?: string; name?: string }> {
  try {
    const res = await request(srcUrl, {
      method: 'GET',
      timeout: 30_000,
      useBackendHttp: true,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const script = await res.text();
    const result = await importMfPlugin({ script, srcUrl, enable: true });
    return {
      ok: result.ok,
      error: result.error,
      name: result.name,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function updateAllMfPluginsWithSrcUrl(): Promise<{
  checked: number;
  updated: number;
  errors: string[];
}> {
  const updates = await checkAllMfPluginUpdates();
  const pending = updates.filter((u) => u.hasUpdate && u.srcUrl);
  let updated = 0;
  const errors: string[] = [];
  for (const u of pending) {
    const result = await applyMfPluginUpdate(u.pluginId, u.srcUrl);
    if (result.ok) updated += 1;
    else errors.push(`${u.name}: ${result.error ?? '失败'}`);
  }
  return { checked: updates.length, updated, errors };
}
