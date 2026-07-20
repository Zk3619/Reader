/**
 * 本机 / 便携 CPython 运行时（优先）
 * 将 host-daemon 写入 AppData 后 spawn，避免 -c 命令行长度限制
 */

import hostDaemonSource from './host-daemon.py?raw';
import { isTauri } from '@/lib/platform/detect';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { resolveProxyBaseUrl } from '../../proxy/client';

export type NativePyProbe = {
  ok: true;
  cmd: string;
  argsPrefix: string[];
  version: string;
} | {
  ok: false;
  error: string;
};

type Worker = {
  write: (line: string) => Promise<string>;
  kill: () => void;
};

let worker: Worker | null = null;
let probeCache: NativePyProbe | null = null;

const PROBE_CANDIDATES: Array<{ cmd: string; argsPrefix: string[] }> = [
  { cmd: 'python', argsPrefix: [] },
  { cmd: 'python3', argsPrefix: [] },
  { cmd: 'py', argsPrefix: ['-3'] },
];

async function ensureDaemonFile(): Promise<string> {
  const { mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs');
  const { join } = await import('@tauri-apps/api/path');
  const root = await getAppDataDir();
  const dir = await join(root, 'tv-py-host');
  const path = await join(dir, 'host-daemon.py');
  await mkdir(dir, { recursive: true });
  // 每次写入最新源码，避免热更新后仍用旧 daemon
  await writeTextFile(path, hostDaemonSource);
  return path;
}

export async function probeNativePython(force = false): Promise<NativePyProbe> {
  if (!force && probeCache) return probeCache;
  if (!isTauri()) {
    probeCache = { ok: false, error: '非 Tauri 桌面环境' };
    return probeCache;
  }
  const { Command } = await import('@tauri-apps/plugin-shell');
  const errors: string[] = [];
  for (const c of PROBE_CANDIDATES) {
    try {
      const out = await Command.create(c.cmd, [
        ...c.argsPrefix,
        '-c',
        'import sys; print(sys.version.split()[0])',
      ]).execute();
      const ver = (out.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
      if (out.code === 0 && ver) {
        probeCache = { ok: true, cmd: c.cmd, argsPrefix: c.argsPrefix, version: ver };
        return probeCache;
      }
      errors.push(`${c.cmd}: exit ${out.code} ${out.stderr || out.stdout}`);
    } catch (e) {
      errors.push(`${c.cmd}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  probeCache = {
    ok: false,
    error: `未找到可用的 Python（已试 python / python3 / py -3）。${errors.slice(0, 2).join('；')}`,
  };
  return probeCache;
}

async function spawnWorker(): Promise<Worker> {
  const probe = await probeNativePython();
  if (!probe.ok) throw new Error(probe.error);
  const script = await ensureDaemonFile();
  const proxyBase = await resolveProxyBaseUrl();
  const { Command } = await import('@tauri-apps/plugin-shell');
  const { join } = await import('@tauri-apps/api/path');
  const root = await getAppDataDir();
  const pyCache = await join(root, 'tv-py-cache');
  const cmd = Command.create(probe.cmd, [...probe.argsPrefix, '-u', script], {
    env: {
      READER_TV_PROXY: proxyBase,
      READER_TV_PY_CACHE: pyCache,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      PYTHONNOUSERSITE: '0',
    },
  });
  const pending: Array<{
    resolve: (s: string) => void;
    reject: (e: Error) => void;
  }> = [];

  if (!cmd.stdout || !cmd.stderr) {
    throw new Error('Tauri shell Command 缺少 stdout/stderr');
  }
  cmd.stdout.on('data', (line: string) => {
    const s = String(line).trim();
    // Spider print 偶发泄漏到 stdout：忽略非 JSON 行，避免 JSON.parse 炸
    if (!s.startsWith('{')) {
      if (s) console.warn('[tv-py-native][stdout]', s.slice(0, 240));
      return;
    }
    const p = pending.shift();
    if (p) p.resolve(s);
  });
  cmd.stderr.on('data', (line: string) => {
    console.warn('[tv-py-native]', line);
  });
  cmd.on('close', () => {
    worker = null;
    while (pending.length) {
      pending.shift()?.reject(new Error('python exited'));
    }
  });
  cmd.on('error', (err) => {
    console.warn('[tv-py-native] error', err);
  });

  const child = await cmd.spawn();
  /** 首次 pip 可能 30–90s；正常 RPC 仍应很快 */
  const rpcTimeoutMs = 180_000;
  return {
    write(line: string) {
      return new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
        void child.write(`${line}\n`).catch(reject);
        setTimeout(() => {
          const i = pending.findIndex((x) => x.resolve === resolve);
          if (i >= 0) {
            pending.splice(i, 1);
            reject(new Error('python rpc timeout'));
          }
        }, rpcTimeoutMs);
      });
    },
    kill() {
      void child.kill();
    },
  };
}

export async function ensureNativeWorker(): Promise<Worker> {
  if (worker) return worker;
  worker = await spawnWorker();
  return worker;
}

export function destroyNativeWorker(): void {
  worker?.kill();
  worker = null;
}

export async function nativePyInvoke(payload: {
  api: string;
  ext: string;
  method: string;
  args: unknown[];
  siteKey?: string;
}): Promise<string> {
  const w = await ensureNativeWorker();
  const proxyBase = await resolveProxyBaseUrl();
  const raw = await w.write(
    JSON.stringify({
      ...payload,
      proxyBase,
    }),
  );
  const parsed = JSON.parse(raw) as { ok: boolean; data?: string; error?: string };
  if (!parsed.ok) throw new Error(parsed.error || 'python error');
  return parsed.data ?? '';
}
