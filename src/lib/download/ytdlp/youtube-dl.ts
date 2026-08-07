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
import { prepareFilename } from './outtmpl';
import { YtdlpCookieJar, getSharedCookieJar } from './cookie-jar';
import { validateProxyUrl } from './networking/socks';
import './extractors';

export class YoutubeDL implements DownloaderLike {
  params: YoutubeDLOptions;
  private _progressHooks: ProgressHook[] = [];
  private _pps: PostProcessor[] = [];
  private _archive: DownloadArchive;
  /** Per-instance cookie jar used by InfoExtractor._set_cookie */
  cookiejar: YtdlpCookieJar;

  constructor(params: YoutubeDLOptions = {}) {
    this.params = { ...params };
    if (params.progress_hooks?.length) {
      this._progressHooks.push(...params.progress_hooks);
    }
    this._archive = new DownloadArchive(
      params.download_archive as string | Set<string> | undefined,
    );
    this.cookiejar = getSharedCookieJar();
    const proxyErr = validateProxyUrl(this.params.proxy as string | undefined);
    if (proxyErr) this.report_warning(proxyErr);
  }

  /** Expand outtmpl → output path (does not create dirs / fetch media). */
  prepare_filename(info: VideoInfo, dirType: '' | 'home' | 'temp' = ''): string {
    return prepareFilename(info, this.params, dirType);
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
    const base = await resolveCookieHeader(url, {
      cookie: this.params.cookie as string | undefined,
      cookiefileText:
        typeof this.params.cookiefile === 'string' &&
        (this.params.cookiefile.includes('\n') || this.params.cookiefile.includes('\t'))
          ? this.params.cookiefile
          : undefined,
      usePlatformJar: true,
    });
    return this.cookiejar.mergeIntoHeader(url, base);
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
        if (this.params.ignoreerrors) {
          this.report_warning(`Ignored extract error: ${(e as Error).message || e}`);
          return null;
        }
        throw e;
      }
    }
    if (!info) {
      if (this.params.ignoreerrors) return null;
      throw lastErr instanceof Error ? lastErr : new ExtractorError(String(lastErr));
    }
    info = this.sanitize_info(info);

    const filterReject = this._matchFilterReject(info);
    if (filterReject) {
      if (this.params.break_on_reject) {
        throw new RejectedVideoReached(filterReject);
      }
      if (this.params.ignoreerrors) {
        this.report_warning(filterReject);
        return null;
      }
      throw new ExtractorError(filterReject, { expected: true });
    }

    try {
      return await this.process_ie_result(info, download);
    } catch (e) {
      if (e instanceof ExistingVideoReached || e instanceof RejectedVideoReached) throw e;
      if (this.params.ignoreerrors) {
        this.report_warning(`Ignored process error: ${(e as Error).message || e}`);
        return null;
      }
      throw e;
    }
  }

  /**
   * Align yt-dlp process_ie_result — recurse url / url_transparent; expand playlists.
   */
  async process_ie_result(ie_result: VideoInfo, download = false): Promise<VideoInfo | null> {
    const info = this.sanitize_info(ie_result);
    const t = info._type;

    if (t === 'url' || t === 'url_transparent') {
      const target = String(info.url || '');
      if (!target) throw new ExtractorError('url result missing url', { expected: true });
      const ieKey = String(
        (info as VideoInfo & { ie_key?: string }).ie_key ||
          info.extractor_key ||
          info.extractor ||
          '',
      ) || undefined;
      const nested = await this.extract_info(target, download, ieKey);
      if (!nested) return null;
      if (t === 'url_transparent') {
        const merged: VideoInfo = { ...nested };
        for (const [k, v] of Object.entries(info)) {
          if (k === '_type' || k === 'url' || k === 'ie_key' || k === 'extractor' || k === 'extractor_key') {
            continue;
          }
          if ((merged as Record<string, unknown>)[k] == null && v != null) {
            (merged as Record<string, unknown>)[k] = v;
          }
        }
        return this.process_video_result(merged, download);
      }
      return nested;
    }

    if (t === 'playlist' || t === 'multi_video') {
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
      if (info.entries?.length) {
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
            const nested = await this.process_ie_result(
              entry._type ? entry : { ...entry, _type: entry.formats?.length ? 'video' : 'url' },
              download,
            );
            if (nested) out.push(nested);
          } catch (e) {
            if (e instanceof ExistingVideoReached && this.params.break_on_existing) throw e;
            if (e instanceof RejectedVideoReached && this.params.break_on_reject) throw e;
            if (!this.params.ignoreerrors) {
              this.report_warning(`Playlist entry failed: ${(e as Error).message}`);
            } else {
              this.report_warning(`Playlist entry ignored: ${(e as Error).message}`);
            }
          }
        }
        info.entries = out;
      }
      return info;
    }

    return this.process_video_result(info, download);
  }

  async process_video_result(info: VideoInfo, download = false): Promise<VideoInfo> {
    const ageLimit = this.params.age_limit;
    if (
      typeof ageLimit === 'number' &&
      typeof info.age_limit === 'number' &&
      info.age_limit > ageLimit
    ) {
      throw new ExtractorError(
        `Video requires age ${info.age_limit}+ (limit ${ageLimit})`,
        { expected: true },
      );
    }

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

    if (!info._filename) {
      info._filename = this.prepare_filename(info);
    }

    if (this.params.writeinfojson && info._filename) {
      try {
        const { WriteInfoJsonPP } = await import('./postprocessors/chapters');
        await new WriteInfoJsonPP().run({
          info,
          filename: info._filename,
          options: this.params,
        });
      } catch (e) {
        this.report_warning(`writeinfojson: ${(e as Error).message || e}`);
      }
    }

    if (
      this.params.writedescription ||
      this.params.writethumbnail ||
      this.params.writesubtitles ||
      this.params.writeautomaticsub
    ) {
      try {
        const { writeSidecars } = await import('./postprocessors/sidecar');
        await writeSidecars(info, this.params);
      } catch (e) {
        this.report_warning(`sidecar: ${(e as Error).message || e}`);
      }
    }

    if (download && !this.params.skip_download) {
      if (this.params.allow_stub_download) {
        void this._notifyProgress({
          status: 'finished',
          info_dict: info,
          filename: info._filename,
        });
        const out = await runPostProcessors(info, this.params, this._pps);
        await this._archive.record(out);
        return out;
      }
      void this._notifyProgress({
        status: 'processing',
        info_dict: info,
        filename: info._filename,
      });
      this.report_warning(
        'YoutubeDL does not download media; returning prepared info with _filename. ' +
          'Use DownloadService / engine-bridge for bytes (or set allow_stub_download).',
      );
      return info;
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
   * yt-dlp match_filter subset:
   * - function → rejection string
   * - numeric: `duration>N` / `view_count<=N` (&-joined)
   * - string: `title*=foo` contains / `title!=bar` / `uploader=exact`
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
      const trimmed = part.trim();
      if (!trimmed) continue;
      const num = /^\s*([a-z_]+)\s*(<=|>=|<|>|=)\s*(\d+)\s*$/i.exec(trimmed);
      if (num) {
        const key = num[1]!.toLowerCase();
        const op = num[2]!;
        const want = Number(num[3]);
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
        continue;
      }
      const str = /^\s*([a-z_]+)\s*(\*=|!=|=)\s*(.+?)\s*$/i.exec(trimmed);
      if (str) {
        const key = str[1]!.toLowerCase();
        const op = str[2]!;
        const want = str[3]!;
        const got = String((info as Record<string, unknown>)[key] ?? '');
        const ok =
          op === '*='
            ? got.toLowerCase().includes(want.toLowerCase())
            : op === '!='
              ? got !== want
              : got === want;
        if (!ok) return `${key} "${got}" does not match ${op}${want}`;
      }
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
