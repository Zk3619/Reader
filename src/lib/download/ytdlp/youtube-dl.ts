/**
 * YoutubeDL — extract_info / download orchestration (yt-dlp-compatible subset).
 */

import { InfoExtractor, ExtractorError, type DownloaderLike } from './common';
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
import {
  runPostProcessors,
  type PostProcessor,
} from './postprocessors';
import './extractors';

export class YoutubeDL implements DownloaderLike {
  params: YoutubeDLOptions;
  private _progressHooks: ProgressHook[] = [];
  private _pps: PostProcessor[] = [];

  constructor(params: YoutubeDLOptions = {}) {
    this.params = { ...params };
    if (params.progress_hooks?.length) {
      this._progressHooks.push(...params.progress_hooks);
    }
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
    let info = await ie.extract(url);
    info = this.sanitize_info(info);

    if (info._type === 'playlist' || info._type === 'multi_video') {
      if (this.params.extract_flat) {
        return info;
      }
      // Process entries shallowly when download requested
      if (download && info.entries?.length) {
        const out: VideoInfo[] = [];
        for (const entry of info.entries) {
          if (!entry) continue;
          if (entry.url && !entry.formats?.length) {
            try {
              const nested = await this.extract_info(entry.url, download);
              if (nested) out.push(nested);
            } catch (e) {
              this.report_warning(`Playlist entry failed: ${(e as Error).message}`);
            }
          } else {
            out.push(await this.process_video_result({ ...entry }, download));
          }
        }
        info.entries = out;
      }
      return info;
    }

    return this.process_video_result(info, download);
  }

  async process_video_result(info: VideoInfo, download = false): Promise<VideoInfo> {
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
      // Actual byte download is left to Reader's download pipeline;
      // we fire progress hooks and run postprocessors on the info dict.
      void this._notifyProgress({
        status: 'finished',
        info_dict: info,
        filename: info._filename,
      });
      void runPostProcessors(info, this.params, this._pps);
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
