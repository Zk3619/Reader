/**
 * YoutubeDL — extract_info / download orchestration (yt-dlp-compatible).
 * Aligned with yt_dlp/YoutubeDL.py process_ie_result / process_video_result / _match_entry.
 */

import {
  InfoExtractor,
  ExtractorError,
  ExistingVideoReached,
  RejectedVideoReached,
  MaxDownloadsReached,
  ReExtractInfo,
  type DownloaderLike,
} from './common';
import { resolveCookieHeader } from './cookies';
import { bootstrapYtdlpCookies } from './cookies-browser';
import { selectBestFormat, selectFormats } from './format-selector';
import { applyFormatSort } from './format-sort';
import { getExtractorForUrl, ensureBuiltinLoaded, getExtractorEntry } from './registry';
import type {
  Format,
  ProgressHook,
  ProgressHookInfo,
  Subtitle,
  Thumbnail,
  VideoInfo,
  YoutubeDLOptions,
} from './types';
import { type PostProcessor, runPostProcessors } from './postprocessors';
import { DownloadArchive } from './archive';
import { resolvePlaylistIndices } from './playlist-items';
import { prepareFilename } from './outtmpl';
import { YtdlpCookieJar, getSharedCookieJar } from './cookie-jar';
import { validateProxyUrl } from './networking/socks';
import { matchEntry } from './match-entry';
import { processSubtitles } from './process-subtitles';
import { applyRangeToInfo, resolveDownloadRanges } from './download-ranges';
import { cleanInfoJson } from './clean-infojson';
import { writeLinkSidecars } from './writelink';
import { attachDownloaderOptions } from './downloader-options';
import './extractors';

const FREE_EXTS = new Set([
  'webm',
  'ogg',
  'opus',
  'mkv',
  'ogv',
  'flac',
  'vorbis',
  'vp8',
  'vp9',
  'av1',
]);

function isFreeFormat(f: Format): boolean {
  const ext = (f.ext || '').toLowerCase();
  const vc = String(f.vcodec || '').toLowerCase();
  const ac = String(f.acodec || '').toLowerCase();
  return (
    FREE_EXTS.has(ext) ||
    vc.includes('vp9') ||
    vc.includes('vp8') ||
    vc.includes('av01') ||
    ac.includes('opus') ||
    ac.includes('vorbis')
  );
}

function resolveExternalDownloader(
  options: YoutubeDLOptions,
  protocol?: string,
): string | boolean | undefined {
  const ed = options.external_downloader;
  if (ed == null || ed === false) return undefined;
  if (typeof ed === 'string' || ed === true) return ed;
  if (typeof ed === 'object') {
    const proto = (protocol || 'http').split('+')[0] || 'http';
    if (ed[proto] != null) return ed[proto];
    if (ed.default != null) return ed.default;
  }
  return undefined;
}

export function applyDefaultSearch(url: string, defaultSearch?: string): string {
  const u = (url || '').trim();
  if (!u) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
  const prefix = (defaultSearch || '').trim();
  if (!prefix || prefix === 'auto' || prefix === 'auto_warning') {
    if (prefix === 'auto_warning' || prefix === 'auto') {
      return `ytsearch:${u}`;
    }
    return u;
  }
  if (prefix === 'error') {
    throw new ExtractorError(
      `Default search disabled; pass a URL or set default_search (got bare query: ${u})`,
      { expected: true },
    );
  }
  return prefix.endsWith(':') ? `${prefix}${u}` : `${prefix}:${u}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

function formatListFormats(formats: Format[]): string {
  const lines = ['ID  EXT  RESOLUTION  NOTE  URL'];
  for (const f of formats) {
    const res =
      f.resolution ||
      (f.width && f.height ? `${f.width}x${f.height}` : f.height ? `${f.height}p` : '');
    lines.push(
      `${f.format_id || '?'}  ${f.ext || '?'}  ${res}  ${f.format_note || ''}  ${(f.url || '').slice(0, 60)}`,
    );
  }
  return lines.join('\n');
}

function formatListSubtitles(subs: Record<string, Subtitle[]> | undefined): string {
  if (!subs) return '';
  const lines: string[] = [];
  for (const [lang, list] of Object.entries(subs)) {
    const exts = list.map((s) => s.ext || '?').join(', ');
    lines.push(`${lang}: ${exts}`);
  }
  return lines.join('\n');
}

function formatListThumbnails(thumbs: Thumbnail[] | undefined): string {
  if (!thumbs?.length) return '';
  return thumbs
    .map(
      (t, i) =>
        `${t.id || i}: ${t.width || '?'}x${t.height || '?'} ${t.url}`,
    )
    .join('\n');
}

export class YoutubeDL implements DownloaderLike {
  params: YoutubeDLOptions;
  private _progressHooks: ProgressHook[] = [];
  private _pps: PostProcessor[] = [];
  private _archive: DownloadArchive;
  private _numDownloads = 0;
  private _cookiesReady: Promise<void>;
  /** Per-instance cookie jar used by InfoExtractor._set_cookie */
  cookiejar: YtdlpCookieJar;

  constructor(params: YoutubeDLOptions = {}) {
    this.params = { ...params };
    if (this.params.simulate == null && (params.listformats || params.listsubtitles || params.list_thumbnails)) {
      this.params.simulate = 'list_only';
    }
    if (params.progress_hooks?.length) {
      this._progressHooks.push(...params.progress_hooks);
    }
    this._archive = new DownloadArchive(
      params.download_archive as string | Set<string> | undefined,
    );
    this.cookiejar = getSharedCookieJar();
    const proxyErr = validateProxyUrl(this.params.proxy as string | undefined);
    if (proxyErr) this.report_warning(proxyErr);
    this._cookiesReady = bootstrapYtdlpCookies(this.cookiejar, this.params, (m) =>
      this.report_warning(m),
    );
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

  /** yt-dlp add_extra_info */
  static add_extra_info(info: VideoInfo, extra: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(extra)) {
      if ((info as Record<string, unknown>)[k] == null && v != null) {
        (info as Record<string, unknown>)[k] = v;
      }
    }
  }

  async cookieHeaderFor(url: string): Promise<string> {
    await this._cookiesReady;
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

  private _shouldIgnoreError(phase: 'extract' | 'download' = 'extract'): boolean {
    const ig = this.params.ignoreerrors;
    if (!ig) return false;
    if (ig === 'only_download') return phase === 'download';
    return true;
  }

  private _raiseMatch(reason: string, breakOpt: 'break_on_existing' | 'break_on_reject'): never {
    this.to_screen(`[download] ${reason}`);
    if (breakOpt === 'break_on_existing' && this.params.break_on_existing) {
      throw new ExistingVideoReached(reason);
    }
    if (breakOpt === 'break_on_reject' && this.params.break_on_reject) {
      throw new RejectedVideoReached(reason);
    }
    throw new ExtractorError(reason, { expected: true });
  }

  private _applyMatchOrThrow(info: VideoInfo, incomplete = false): void {
    const { reason, breakOpt } = matchEntry(info, this.params, this._archive, incomplete);
    if (reason) this._raiseMatch(reason, breakOpt);
  }

  private _checkMaxDownloads(): void {
    const max = this.params.max_downloads;
    if (max != null && this._numDownloads >= Number(max)) {
      throw new MaxDownloadsReached();
    }
  }

  private async _waitForVideo(ieResult: VideoInfo): Promise<void> {
    const wait = this.params.wait_for_video;
    if (wait == null) return;
    if ((ieResult._type || 'video') !== 'video') return;
    if (ieResult.formats?.length || ieResult.url) return;

    const minWait = Array.isArray(wait) ? Number(wait[0]) || 0 : Number(wait) || 0;
    const maxWait = Array.isArray(wait) ? Number(wait[1]) || minWait : minWait;
    let diff: number | null = null;
    const release = Number(ieResult.release_timestamp);
    if (Number.isFinite(release)) {
      diff = release - Date.now() / 1000;
    } else if (ieResult.live_status === 'is_upcoming') {
      diff = Math.round(minWait + Math.random() * Math.max(0, maxWait - minWait));
      this.report_warning('Release time of video is not known');
    }
    if (diff != null && diff <= 0) {
      this.report_warning('Video should already be available according to extracted info');
    }
    const waitSec = Math.min(Math.max(diff || 0, minWait), maxWait || Number.POSITIVE_INFINITY);
    if (!Number.isFinite(waitSec) || waitSec <= 0) {
      throw new ReExtractInfo('[wait] Wait period ended', true);
    }
    this.to_screen(`[wait] Waiting for ${Math.round(waitSec)}s`);
    await sleep(Math.min(waitSec, maxWait || waitSec) * 1000);
    throw new ReExtractInfo('[wait] Wait period ended', true);
  }

  /**
   * Extract video info (and optionally download).
   * Mirrors yt-dlp `extract_info`.
   */
  async extract_info(
    url: string,
    download = true,
    ie_key?: string,
    extra_info?: Record<string, unknown>,
    process = true,
  ): Promise<VideoInfo | null> {
    await this._cookiesReady;
    ensureBuiltinLoaded();
    await this._archive.ensureLoaded();

    let resolvedUrl = url;
    try {
      resolvedUrl = applyDefaultSearch(url, this.params.default_search as string | undefined);
    } catch (e) {
      if (this._shouldIgnoreError('extract')) {
        this.report_warning((e as Error).message);
        return null;
      }
      throw e;
    }

    if (this.params.videopassword) {
      this.params = { ...this.params, videopassword: this.params.videopassword };
    }

    let ie: InfoExtractor | null = null;
    if (ie_key) {
      const entry = getExtractorEntry(ie_key);
      if (entry) {
        ie = entry.create();
        ie.set_downloader(this);
      }
    }
    if (!ie) {
      ie = getExtractorForUrl(resolvedUrl, this);
    }
    if (!ie) {
      throw new ExtractorError(`No suitable extractor for URL: ${resolvedUrl}`, { expected: true });
    }

    if (this.params.allowed_extractors?.length) {
      const allowed = this.params.allowed_extractors.map((s) => String(s).toLowerCase());
      const name = String(ie.IE_NAME || '').toLowerCase();
      const key = String(ie.ie_key || '').toLowerCase();
      if (!allowed.some((a) => a === 'all' || a === name || a === key || name.includes(a))) {
        throw new ExtractorError(`Extractor ${ie.IE_NAME} not in allowed_extractors`, {
          expected: true,
        });
      }
    }

    this.to_screen(`[${ie.IE_NAME}] Extracting URL: ${resolvedUrl}`);
    const netRetries = Math.max(0, Number(this.params.retries ?? 0));
    const ieRetries = Math.max(0, Number(this.params.extractor_retries ?? netRetries));
    const retries = Math.max(netRetries, ieRetries);
    let info: VideoInfo | null = null;
    let lastErr: unknown;
    const maxWaitRounds = this.params.wait_for_video != null ? 8 : 1;

    for (let waitRound = 0; waitRound < maxWaitRounds; waitRound++) {
      info = null;
      lastErr = undefined;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          if (this.params.sleep_interval_requests) {
            await sleep(Number(this.params.sleep_interval_requests) * 1000);
          }
          info = await ie.extract(resolvedUrl);
          lastErr = undefined;
          break;
        } catch (e) {
          lastErr = e;
          const name = (e as Error)?.name || '';
          if (name === 'UserNotLive' && this.params.wait_for_video != null) {
            this.report_warning(`User not live; waiting… (${(e as Error).message || e})`);
            const w = this.params.wait_for_video;
            const sec = Array.isArray(w) ? Number(w[0]) || 5 : Number(w) || 5;
            await sleep(sec * 1000);
            lastErr = new ReExtractInfo('UserNotLive wait', true);
            break;
          }
          if (attempt < retries) {
            this.report_warning(
              `Extract retry ${attempt + 1}/${retries}: ${(e as Error).message || e}`,
            );
            await sleep(400 * (attempt + 1));
            continue;
          }
          if (this._shouldIgnoreError('extract')) {
            this.report_warning(`Ignored extract error: ${(e as Error).message || e}`);
            return null;
          }
          throw e;
        }
      }

      if (lastErr instanceof ReExtractInfo) continue;
      if (!info) {
        if (this._shouldIgnoreError('extract')) return null;
        throw lastErr instanceof Error ? lastErr : new ExtractorError(String(lastErr));
      }

      info = this.sanitize_info(info);
      if (extra_info) YoutubeDL.add_extra_info(info, extra_info);
      if (this.params.extra_info) YoutubeDL.add_extra_info(info, this.params.extra_info);

      try {
        await this._waitForVideo(info);
      } catch (e) {
        if (e instanceof ReExtractInfo) continue;
        throw e;
      }
      break;
    }

    if (!info) {
      if (this._shouldIgnoreError('extract')) return null;
      throw lastErr instanceof Error ? lastErr : new ExtractorError(String(lastErr));
    }

    try {
      this._applyMatchOrThrow(info, true);
    } catch (e) {
      if (e instanceof ExistingVideoReached || e instanceof RejectedVideoReached) throw e;
      if (e instanceof ExtractorError && e.expected) {
        if (this._shouldIgnoreError('extract')) {
          this.report_warning(e.message);
          return null;
        }
      }
      throw e;
    }

    if (!process) return info;

    try {
      return await this.process_ie_result(info, download);
    } catch (e) {
      if (
        e instanceof ExistingVideoReached ||
        e instanceof RejectedVideoReached ||
        e instanceof MaxDownloadsReached
      ) {
        throw e;
      }
      if (this._shouldIgnoreError('extract')) {
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
      const ieKey =
        String(
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
          if (
            k === '_type' ||
            k === 'url' ||
            k === 'ie_key' ||
            k === 'extractor' ||
            k === 'extractor_key'
          ) {
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
      return this._processPlaylist(info, download);
    }

    return this.process_video_result(info, download);
  }

  private async _processPlaylist(info: VideoInfo, download: boolean): Promise<VideoInfo> {
    if (this.params.lazy_playlist) {
      this.to_screen(
        '[download] lazy_playlist: processing entries sequentially as resolved (Reader always streams entries)',
      );
    }
    if (info.entries?.length) {
      const indices = resolvePlaylistIndices(info.entries.length, {
        playlist_items: this.params.playlist_items as string | undefined,
        playliststart: this.params.playliststart as number | undefined,
        playlistend: this.params.playlistend as number | undefined,
      });
      if (indices.length < info.entries.length) {
        info.entries = indices.map((i) => info.entries![i]!);
      }
      if (this.params.playlistreverse) {
        info.entries = [...info.entries].reverse();
      } else if (this.params.playlistrandom) {
        const copy = [...info.entries];
        shuffleInPlace(copy);
        info.entries = copy;
      }
    }

    const extractFlat = this.params.extract_flat;
    if (extractFlat === true || extractFlat === 'in_playlist') {
      if (this.params.force_write_download_archive) {
        for (const entry of info.entries || []) {
          if (entry) await this._archive.record(entry);
        }
      }
      return info;
    }

    if (!info.entries?.length) return info;

    const out: VideoInfo[] = [];
    const keepResolved = extractFlat !== 'discard' && extractFlat !== 'discard_in_playlist';
    let failures = 0;
    const maxFailures = this.params.skip_playlist_after_errors ?? Number.POSITIVE_INFINITY;

    for (let idx = 0; idx < info.entries.length; idx++) {
      const entry = info.entries[idx];
      if (!entry) continue;
      try {
        this._checkMaxDownloads();
      } catch (e) {
        if (e instanceof MaxDownloadsReached) break;
        throw e;
      }

      if (this._archive.has(entry)) {
        const msg = `Already downloaded playlist entry: ${entry.id || entry.title || 'entry'}`;
        if (this.params.break_on_existing) throw new ExistingVideoReached(msg);
        this.report_warning(msg);
        continue;
      }

      try {
        YoutubeDL.add_extra_info(entry, {
          playlist: info.title || info.id,
          playlist_index: idx + 1,
          playlist_count: info.entries.length,
        });
        const nested = await this.process_ie_result(
          entry._type ? entry : { ...entry, _type: entry.formats?.length ? 'video' : 'url' },
          download,
        );
        if (nested && keepResolved) out.push(nested);
      } catch (e) {
        if (e instanceof MaxDownloadsReached) break;
        if (e instanceof ExistingVideoReached && this.params.break_on_existing) throw e;
        if (e instanceof RejectedVideoReached && this.params.break_on_reject) throw e;
        failures++;
        this.report_warning(
          this._shouldIgnoreError('extract')
            ? `Playlist entry ignored: ${(e as Error).message}`
            : `Playlist entry failed: ${(e as Error).message}`,
        );
        if (failures >= maxFailures) {
          this.report_warning('skip_playlist_after_errors reached; stopping playlist');
          break;
        }
        if (!this._shouldIgnoreError('extract') && !(e instanceof ExtractorError && e.expected)) {
          /* continue playlist on expected errors */
        }
      }
    }
    info.entries = out;
    return info;
  }

  async process_video_result(info: VideoInfo, download = false): Promise<VideoInfo> {
    this._applyMatchOrThrow(info, false);

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

    // DRM filter (upstream allow_unplayable_formats)
    if (!this.params.allow_unplayable_formats) {
      formats = formats.filter((f) => {
        const d = f.has_drm as unknown;
        return !d || d === 'maybe';
      });
    }

    // live_from_start
    const isLive = !!info.is_live;
    const getFromStart = !isLive || !!this.params.live_from_start;
    if (isLive && !getFromStart && info.title) {
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      info.title = `${info.title} ${stamp}`;
    }
    if (isLive && formats.length) {
      const filtered = formats.filter((f) => !!f.is_from_start === getFromStart);
      if (getFromStart && !filtered.length) {
        throw new ExtractorError(
          'live_from_start is set, but there are no formats that can be downloaded from the start',
          { expected: true },
        );
      }
      if (filtered.length) formats = filtered;
    }

    formats = formats.filter((f) => !!f.url);

    // prefer_free_formats — boost free codecs/containers to the front after sort
    if (this.params.prefer_free_formats) {
      formats = [
        ...formats.filter((f) => isFreeFormat(f)),
        ...formats.filter((f) => !isFreeFormat(f)),
      ];
    }

    // min/max filesize
    const minFs = this.params.min_filesize;
    const maxFs = this.params.max_filesize;
    if (minFs != null || maxFs != null) {
      formats = formats.filter((f) => {
        const sz = Number(f.filesize ?? f.filesize_approx ?? NaN);
        if (!Number.isFinite(sz)) return true;
        if (minFs != null && sz < Number(minFs)) return false;
        if (maxFs != null && sz > Number(maxFs)) return false;
        return true;
      });
    }

    if (!formats.length) {
      if (!this.params.ignore_no_formats_error) {
        throw new ExtractorError('No video formats found', { expected: true });
      }
      this.report_warning('No video formats found');
    }

    if (this.params.check_formats && formats.length) {
      formats = await this._checkFormatsReachable(formats);
    }

    formats = applyFormatSort(formats, {
      format_sort: this.params.format_sort,
      format_sort_force: this.params.format_sort_force || !!this.params.prefer_free_formats,
      extractor_sort: Array.isArray(info._format_sort_fields)
        ? (info._format_sort_fields as string[])
        : undefined,
    });
    if (this.params.prefer_free_formats) {
      formats = [
        ...formats.filter((f) => isFreeFormat(f)),
        ...formats.filter((f) => !isFreeFormat(f)),
      ];
    }
    info.formats = formats;

    info.requested_subtitles = processSubtitles(
      String(info.id),
      info,
      this.params,
      (m) => this.report_warning(m),
    );

    if (this.params.getcomments) {
      await this._extractComments(info);
    }

    // list_* / simulate list_only
    if (this.params.list_thumbnails) {
      info.thumbnails_table = formatListThumbnails(info.thumbnails);
      this.to_screen(info.thumbnails_table || '(no thumbnails)');
    }
    if (this.params.listsubtitles) {
      info.subtitles_table = [
        formatListSubtitles(info.subtitles),
        formatListSubtitles(info.automatic_captions),
      ]
        .filter(Boolean)
        .join('\n');
      this.to_screen(info.subtitles_table || '(no subtitles)');
    }
    if (this.params.listformats) {
      info.formats_table = formatListFormats(formats);
      this.to_screen(info.formats_table || '(no formats)');
    }
    if (this.params.simulate === 'list_only') {
      if (this.params.force_write_download_archive) await this._archive.record(info);
      return info;
    }

    const formatSpec = (this.params.format as string) || 'bv*+ba/b';
    const selected = selectFormats(formats, formatSpec);
    const best = selected[0] || selectBestFormat(formats, 'best');
    if (!best && !this.params.ignore_no_formats_error) {
      throw new ExtractorError(
        'Requested format is not available. Use listformats for a list of available formats',
        { expected: true },
      );
    }
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

    // download_ranges → section_* (+ force_keyframes flag); multi-range → requested_downloads
    const ranges = resolveDownloadRanges(info, this.params, this);
    const formatsToDownload =
      info.requested_formats?.length
        ? info.requested_formats
        : best
          ? [best]
          : [];
    const rangeInfos: VideoInfo[] = [];
    for (const fmt of formatsToDownload.length ? formatsToDownload : [null]) {
      for (const chapter of ranges) {
        const base: VideoInfo = {
          ...info,
          ...(fmt
            ? {
                url: fmt.url || info.url,
                format_id: fmt.format_id || info.format_id,
                ext: fmt.ext || info.ext,
                protocol: fmt.protocol || info.protocol,
                http_headers: fmt.http_headers || info.http_headers,
              }
            : {}),
        };
        const sliced = applyRangeToInfo(base, chapter);
        if (this.params.force_keyframes_at_cuts) {
          sliced.force_keyframes_at_cuts = true;
        }
        rangeInfos.push(sliced);
      }
    }
    if (rangeInfos.length === 1) {
      Object.assign(info, {
        section_start: rangeInfos[0]!.section_start,
        section_end: rangeInfos[0]!.section_end,
        section_title: rangeInfos[0]!.section_title,
        section_number: rangeInfos[0]!.section_number,
        force_keyframes_at_cuts: rangeInfos[0]!.force_keyframes_at_cuts,
        url: rangeInfos[0]!.url || info.url,
        format_id: rangeInfos[0]!.format_id || info.format_id,
      });
    } else if (rangeInfos.length > 1) {
      info.requested_downloads = rangeInfos;
    }

    const extDl = resolveExternalDownloader(this.params, info.protocol);
    if (extDl != null) info.external_downloader = extDl;

    attachDownloaderOptions(info, this.params);

    try {
      await writeLinkSidecars(info, this.params);
    } catch (e) {
      this.report_warning(`writelink: ${(e as Error).message || e}`);
    }

    if (this.params.writeinfojson && info._filename) {
      try {
        const { WriteInfoJsonPP } = await import('./postprocessors/chapters');
        const payload =
          this.params.clean_infojson === false ? info : cleanInfoJson(info);
        await new WriteInfoJsonPP().run({
          info: payload,
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
      this.params.write_all_thumbnails ||
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

    if (this.params.mark_watched) {
      try {
        await this._markWatched(info);
      } catch (e) {
        this.report_warning(`mark_watched: ${(e as Error).message || e}`);
      }
    }

    const simulating = !!this.params.simulate;
    const skipDl = !!this.params.skip_download || simulating;

    if (download && !skipDl) {
      const minSleep = Number(this.params.sleep_interval) || 0;
      const maxSleep = Number(this.params.max_sleep_interval) || minSleep;
      if (minSleep > 0 || maxSleep > 0) {
        const sec =
          maxSleep > minSleep
            ? minSleep + Math.random() * (maxSleep - minSleep)
            : minSleep || maxSleep;
        this.to_screen(`[download] Sleeping ${sec.toFixed(1)}s`);
        await sleep(sec * 1000);
      }

      this._checkMaxDownloads();
      this._numDownloads += 1;
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

    if (simulating && this.params.force_write_download_archive) {
      await this._archive.record(info);
    }

    return info;
  }

  private async _checkFormatsReachable(formats: Format[]): Promise<Format[]> {
    const out: Format[] = [];
    const selectedOnly = this.params.check_formats === 'selected';
    const list = selectedOnly ? formats.slice(0, 8) : formats;
    for (const f of list) {
      if (!f.url) continue;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), Number(this.params.socket_timeout) * 1000 || 8000);
        const res = await fetch(f.url, {
          method: 'HEAD',
          signal: ctrl.signal,
          headers: f.http_headers as HeadersInit | undefined,
        });
        clearTimeout(t);
        if (res.ok || res.status === 405 || res.status === 403) {
          out.push(f);
        } else {
          this.report_warning(`check_formats: HTTP ${res.status} for ${f.format_id}`);
        }
      } catch {
        // HEAD may fail (CORS / network); keep format — engine will verify
        out.push(f);
      }
    }
    return out.length ? out : formats;
  }

  private async _markWatched(info: VideoInfo): Promise<void> {
    const ieKey = info.extractor_key || info.extractor;
    if (!ieKey) return;
    const entry = getExtractorEntry(String(ieKey));
    if (!entry) return;
    const ie = entry.create();
    ie.set_downloader(this);
    const anyIe = ie as InfoExtractor & {
      _mark_watched?: (info: VideoInfo) => Promise<void>;
      mark_watched?: (info: VideoInfo) => Promise<void>;
    };
    if (typeof anyIe._mark_watched === 'function') await anyIe._mark_watched(info);
    else if (typeof anyIe.mark_watched === 'function') await anyIe.mark_watched(info);
  }

  private async _extractComments(info: VideoInfo): Promise<void> {
    try {
      const ieKey = info.extractor_key || info.extractor;
      if (!ieKey) return;
      const entry = getExtractorEntry(String(ieKey));
      if (!entry) return;
      const ie = entry.create();
      ie.set_downloader(this);
      const anyIe = ie as InfoExtractor & {
        _get_comments?: (info: VideoInfo) => AsyncIterable<Record<string, unknown>> | Promise<unknown>;
        extract_comments?: (id: string) => Promise<unknown>;
      };
      const comments: Array<Record<string, unknown>> = [];
      if (typeof anyIe._get_comments === 'function') {
        const gen = await anyIe._get_comments(info);
        if (gen && typeof (gen as AsyncIterable<Record<string, unknown>>)[Symbol.asyncIterator] === 'function') {
          for await (const c of gen as AsyncIterable<Record<string, unknown>>) {
            comments.push(c);
          }
        } else if (Array.isArray(gen)) {
          comments.push(...(gen as Array<Record<string, unknown>>));
        }
      }
      if (comments.length) {
        info.comments = comments;
        info.comment_count = info.comment_count ?? comments.length;
        this.to_screen(`[info] ${info.id}: Extracted ${comments.length} comments`);
      }
    } catch (e) {
      this.report_warning(`getcomments: ${(e as Error).message || e}`);
    }
  }

  async download(urls: string | string[]): Promise<VideoInfo[]> {
    const list = Array.isArray(urls) ? urls : [urls];
    const results: VideoInfo[] = [];
    for (const url of list) {
      this._checkMaxDownloads();
      const info = await this.extract_info(url, true);
      if (info) results.push(info);
      if (this.params.break_per_url) break;
    }
    return results;
  }

  /**
   * Sanitize / normalize info dict.
   */
  sanitize_info(info: VideoInfo, for_archive = false): VideoInfo {
    const out: VideoInfo = { ...info };
    if (!out.id) out.id = (out.display_id as string) || 'unknown';
    if (!out.title) out.title = out.id;
    if (!out.webpage_url && out.original_url) out.webpage_url = out.original_url;
    if (out.display_id == null && out.id) out.display_id = out.id;
    if (out.formats) {
      out.formats = out.formats.map((f) => sanitizeFormat(f));
    }
    if (out.entries) {
      out.entries = out.entries.map((e) => (e ? this.sanitize_info(e, for_archive) : e));
    }
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
