/**
 * External downloader bridge — aria2c / curl / wget (yt-dlp ExternalFD subset).
 * Invoked when YoutubeDLOptions.external_downloader is set.
 */

export type ExternalDownloaderKind = 'aria2c' | 'curl' | 'wget' | 'ffmpeg';

export interface ExternalDownloadRequest {
  url: string;
  outputPath: string;
  headers?: Record<string, string>;
  proxy?: string;
  /** Extra CLI args */
  args?: string[];
  kind?: ExternalDownloaderKind;
}

export interface ExternalDownloadResult {
  ok: boolean;
  outputPath?: string;
  warning?: string;
  via?: string;
}

function headerArgs(kind: ExternalDownloaderKind, headers?: Record<string, string>): string[] {
  if (!headers) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(headers)) {
    if (kind === 'aria2c') out.push(`--header=${k}: ${v}`);
    else if (kind === 'curl') out.push('-H', `${k}: ${v}`);
    else if (kind === 'wget') out.push(`--header=${k}: ${v}`);
  }
  return out;
}

function buildCommand(req: ExternalDownloadRequest): { bin: string; args: string[] } | null {
  const kind = (req.kind || 'aria2c') as ExternalDownloaderKind;
  const headers = headerArgs(kind, req.headers);
  const extra = req.args || [];

  if (kind === 'aria2c') {
    const args = [
      '-c',
      '-x',
      '16',
      '-s',
      '16',
      '-k',
      '1M',
      '-d',
      dirnameOf(req.outputPath),
      '-o',
      basenameOf(req.outputPath),
      ...headers,
      ...extra,
    ];
    if (req.proxy) args.push(`--all-proxy=${req.proxy}`);
    args.push(req.url);
    return { bin: 'aria2c', args };
  }
  if (kind === 'curl') {
    const args = ['-L', '-o', req.outputPath, ...headers, ...extra];
    if (req.proxy) args.push('-x', req.proxy);
    args.push(req.url);
    return { bin: 'curl', args };
  }
  if (kind === 'wget') {
    const args = ['-O', req.outputPath, ...headers, ...extra];
    if (req.proxy) args.push(`-e`, `http_proxy=${req.proxy}`);
    args.push(req.url);
    return { bin: 'wget', args };
  }
  return null;
}

function dirnameOf(p: string): string {
  const norm = p.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/');
  return i >= 0 ? p.slice(0, i) || '.' : '.';
}

function basenameOf(p: string): string {
  const norm = p.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}

/**
 * Run external downloader via Tauri `run_shell_pp` when available.
 */
export async function runExternalDownload(
  req: ExternalDownloadRequest,
): Promise<ExternalDownloadResult> {
  const cmd = buildCommand(req);
  if (!cmd) {
    return { ok: false, warning: `external downloader ${req.kind} not supported` };
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('run_shell_pp', {
      command: cmd.bin,
      args: cmd.args,
      cwd: dirnameOf(req.outputPath),
    });
    return { ok: true, outputPath: req.outputPath, via: cmd.bin };
  } catch (e) {
    return {
      ok: false,
      warning: `[external] ${cmd.bin} failed: ${(e as Error).message || e}`,
      outputPath: req.outputPath,
    };
  }
}

export function parseExternalDownloader(
  raw?: string | boolean | null,
): ExternalDownloaderKind | null {
  if (!raw) return null;
  if (raw === true) return 'aria2c';
  const s = String(raw).toLowerCase();
  if (s.includes('aria')) return 'aria2c';
  if (s.includes('curl')) return 'curl';
  if (s.includes('wget')) return 'wget';
  if (s.includes('ffmpeg')) return 'ffmpeg';
  return null;
}
