/**
 * YoutubeDL — extract_info / download orchestration (yt-dlp-compatible subset).
 */

import { InfoExtractor, ExtractorError, ExistingVideoReached, RejectedVideoReached, type DownloaderLike } from './common';
import { resolveCookieHeader } from './cookies';
import { selectBestFormat, selectFormats } from './format-selector';
import { applyFormatSort } from './format-sort';
import { getExtractorForUrl, ensureBuiltinLoaded, getExtractorEntry } from './registry';
import type {
  Format,
  ProgressHook,
  ProgressHookInfo,
  VideoInfo,
  YoutubeDLOptions,
} from './types';
import { type PostProcessor, runPostProcessors } from './postprocessors';
import { DownloadArchive } from './archive';
import { resolvePlaylistIndices } from './playlist-items';
import './extractors';

export class YoutubeDL implements DownloaderLike {
  params: YoutubeDLOptions;
  private _progressHooks: ProgressHook[] = [];
  private _pps: PostProcessor[] = [];
  private _archive: DownloadArchive;

  constructor(params: YoutubeDLOptions = {}) {
    this.params = { ...params };
    if (params.progress_hooks?.length) {
      this._progressHooks.push(...params.progress_hooks);
    }
    this._archive = new DownloadArchive(
      params.download_archive as string | Set<string> | undefined,
    );
  }

  add_progress_hook(hook: ProgressHook): void {
    this._progressHooks.push(hook);
  }

  add_post_processor(pp: PostProcessor): void {
    this._pps.push(pp);
  }

  to_screen(msg: string): void {
    if (!this.params.quiet) {
      console.info(`[ytdlp] ${msg}`);
    }
  }

  report_warning(msg: string): void {
    if (!this.params.no_warnings) {
      console.warn(`[ytdlp] ${msg}`);
    }
  }

  async cookieHeaderFor(url: string): Promise<string> {
    return resolveCookieHeader(url, {
      cookie: this.params.cookie as string | undefined,
      cookiefileText:
        typeof this.params.cookiefile === 'string' &&
        (this.params.cookiefile.includes('\n') || this.params.cookiefile.includes('\t'))
          ? this.params.cookiefile
          : undefined,
      usePlatformJar: true,
    });
  }

  /**
   * Extract video info (and optionally download).
   * Mirrors yt-dlp `extract_info`.
   */
  async extract_info(
    url: string,
    download = true,
    ie_key?: string,
  ): Promise<VideoInfo | null> {
    ensureBuiltinLoaded();
    await this._archive.ensureLoaded();

    let ie: InfoExtractor | null = null;
    if (ie_key) {
      const entry = getExtractorEntry(ie_key);
      if (entry) {
        ie = entry.create();
        ie.set_downloader(this);
      }
    }
    if (!ie) {
      ie = getExtractorForUrl(url, this);
    }
    if (!ie) {
      throw new ExtractorError(`No suitable extractor for URL: ${url}`, { expected: true });
    }

    this.to_screen(`[${ie.IE_NAME}] Extracting URL: ${url}`);
    const retries = Math.max(0, Number(this.params.retries ?? 0));
    let info: VideoInfo | null = null;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        info = await ie.extract(url);
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt < retries) {
          this.report_warning(
            `Extract retry ${attempt + 1}/${retries}: ${(e as Error).message || e}`,
          );
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    if (!info) throw lastErr instanceof Error ? lastErr : new ExtractorError(String(lastErr));
    info = this.sanitize_info(info);

    const filterReject = this._matchFilterReject(info);
    if (filterReject) {
      if (this.params.break_on_reject) {
        throw new RejectedVideoReached(filterReject);
      }
      throw new ExtractorError(filterReject, { expected: true });
    }

    if (info._type === 'playlist' || info._type === 'multi_video') {
      if (info.entries?.length) {
        const indices = resolvePlaylistIndices(info.entries.length, {
          playlist_items: this.params.playlist_items as string | undefined,
          playliststart: this.params.playliststart as number | undefined,
          playlistend: this.params.playlistend as number | undefined,
        });
        if (indices.length < info.entries.length) {
          info.entries = indices.map((i) => info.entries![i]!);
        }
      }
      if (this.params.extract_flat) {
        return info;
      }
      // Process entries shallowly when download requested
      if (download && info.entries?.length) {
        const out: VideoInfo[] = [];
        for (const entry of info.entries) {
          if (!entry) continue;
          if (this._archive.has(entry)) {
            const msg = `Already downloaded playlist entry: ${entry.id || entry.title || 'entry'}`;
            if (this.params.break_on_existing) {
              throw new ExistingVideoReached(msg);
            }
            this.report_warning(msg);
            continue;
          }
          try {
            if (entry.url && !entry.formats?.length) {
              const nested = await this.extract_info(entry.url, download);
              if (nested) out.push(nested);
            } else {
              out.push(await this.process_video_result({ ...entry }, download));
            }
          } catch (e) {
            if (e instanceof ExistingVideoReached && this.params.break_on_existing) throw e;
            if (e instanceof RejectedVideoReached && this.params.break_on_reject) throw e;
            this.report_warning(`Playlist entry failed: ${(e as Error).message}`);
          }
        }
        info.entries = out;
      }
      return info;
    }

    return this.process_video_result(info, download);
  }

  async process_video_result(info: VideoInfo, download = false): Promise<VideoInfo> {
    if (this._archive.has(info)) {
      const msg = `Already downloaded: ${info.id || info.title || 'entry'}`;
      if (this.params.break_on_existing) {
        throw new ExistingVideoReached(msg);
      }
      throw new ExtractorError(msg, { expected: true });
    }

    let formats = info.formats ? [...info.formats] : [];
    if (!formats.length && info.url) {
      formats = [
        {
          format_id: '0',
          url: info.url,
          ext: info.ext || 'mp4',
          protocol: info.protocol || 'https',
        },
      ];
      info.formats = formats;
    }

    formats = applyFormatSort(formats, {
      format_sort: this.params.format_sort,
      format_sort_force: this.params.format_sort_force,
    });
    info.formats = formats;

    const formatSpec = (this.params.format as string) || 'bv*+ba/b';
    const selected = selectFormats(formats, formatSpec);
    const best = selected[0] || selectBestFormat(formats, 'best');
    if (best) {
      info.requested_formats = best.requested_formats || selected;
      info.format_id = best.format_id;
      info.format = best.format || best.format_id;
      info.ext = best.ext || info.ext;
      info.url = best.url || info.url;
      info.protocol = best.protocol || info.protocol;
      info.http_headers = best.http_headers || info.http_headers;
      // Flatten single selection onto info for convenience
      if (!best.requested_formats) {
        Object.assign(info, {
          width: best.width ?? info.width,
          height: best.height ?? info.height,
          fps: best.fps ?? info.fps,
          vcodec: best.vcodec,
          acodec: best.acodec,
          tbr: best.tbr,
        });
      }
    }

    if (download && !this.params.skip_download) {
      void this._notifyProgress({
        status: 'finished',
        info_dict: info,
        filename: info._filename,
      });
      const out = await runPostProcessors(info, this.params, this._pps);
      await this._archive.record(out);
      return out;
    }

    return info;
  }

  async download(urls: string | string[]): Promise<VideoInfo[]> {
    const list = Array.isArray(urls) ? urls : [urls];
    const results: VideoInfo[] = [];
    for (const url of list) {
      const info = await this.extract_info(url, true);
      if (info) results.push(info);
    }
    return results;
  }

  /**
   * Sanitize / normalize info dict (remove private underscored runtime fields carefully,
   * ensure required keys, stringify safely for IPC).
   */
  sanitize_info(info: VideoInfo, for_archive = false): VideoInfo {
    const out: VideoInfo = { ...info };
    if (!out.id) out.id = out.display_id as string || 'unknown';
    if (!out.title) out.title = out.id;
    if (!out.webpage_url && out.original_url) out.webpage_url = out.original_url;
    if (out.formats) {
      out.formats = out.formats.map((f) => sanitizeFormat(f));
    }
    if (out.entries) {
      out.entries = out.entries.map((e) => (e ? this.sanitize_info(e, for_archive) : e));
    }
    // Drop undefined
    for (const k of Object.keys(out)) {
      if (out[k] === undefined) delete out[k];
    }
    return out;
  }

  /**
   * yt-dlp match_filter subset: function → rejection string, or simple
   * `duration>N` / `duration<N` / `view_count>?` string predicates.
   * Returns rejection message or null if OK.
   */
  private _matchFilterReject(info: VideoInfo): string | null {
    const mf = this.params.match_filter;
    if (!mf) return null;
    if (typeof mf === 'function') {
      const msg = mf(info);
      return msg ? String(msg) : null;
    }
    const spec = String(mf).trim();
    if (!spec) return null;
    for (const part of spec.split('&')) {
      const m = /^\s*([a-z_]+)\s*(<=|>=|<|>|=)\s*(\d+)\s*$/i.exec(part);
      if (!m) continue;
      const key = m[1]!.toLowerCase();
      const op = m[2]!;
      const want = Number(m[3]);
      const got = Number((info as Record<string, unknown>)[key] ?? NaN);
      if (Number.isNaN(got)) return `${key} is missing (match_filter ${spec})`;
      const ok =
        op === '>'
          ? got > want
          : op === '>='
            ? got >= want
            : op === '<'
              ? got < want
              : op === '<='
                ? got <= want
                : got === want;
      if (!ok) return `${key} ${got} does not match ${op}${want}`;
    }
    return null;
  }

  private async _notifyProgress(info: ProgressHookInfo): Promise<void> {
    for (const hook of this._progressHooks) {
      try {
        await hook(info);
      } catch (e) {
        this.report_warning(`progress_hook error: ${(e as Error).message}`);
      }
    }
  }
}

function sanitizeFormat(f: Format): Format {
  const out: Format = { ...f, format_id: f.format_id || '0' };
  if (!out.ext && out.url) {
    try {
      const p = new URL(out.url).pathname;
      const m = p.match(/\.([a-z0-9]{2,5})$/i);
      if (m) out.ext = m[1]!.toLowerCase();
    } catch {
      /* ignore */
    }
  }
  if (!out.protocol && out.url) {
    out.protocol = out.url.includes('.m3u8') ? 'm3u8_native' : 'https';
  }
  return out;
}

/** Convenience one-shot extract */
export async function extractInfo(
  url: string,
  options?: YoutubeDLOptions,
  download = false,
): Promise<VideoInfo | null> {
  const ydl = new YoutubeDL(options);
  return ydl.extract_info(url, download);
}

export default YoutubeDL;
