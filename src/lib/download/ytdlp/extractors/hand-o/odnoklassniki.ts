/** OdnoklassnikiIE — ported from yt-dlp odnoklassniki.py (desktop main path; mobile fallback) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  smuggle_url,
  unescapeHTML,
  unified_strdate,
  unsmuggle_url,
  url_or_none,
} from '../../utils';
import { urlencodePostdata } from './_helpers';

const QUALITY_ORDER = ['4', '0', '1', '2', '3', '5', '6', '7'];

function qualityRank(type: string | null): number | undefined {
  if (!type) return undefined;
  const idx = QUALITY_ORDER.indexOf(type);
  return idx >= 0 ? idx : undefined;
}

export class OdnoklassnikiIE extends InfoExtractor {
  static IE_NAME = 'odnoklassniki';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|m|mobile)\.)?(?:odnoklassniki|ok)\.ru\/(?:video(?<embed>embed)?\/|web-api\/video\/moviePlayer\/|live\/|dk\?[\s\S]*?st\.mvId=)(?<id>[\d-]+)/;

  protected _clearCookies(_cdnUrl: string): void {
    /* CDN cookie reset omitted in TS port */
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    try {
      return await this._extractDesktop(url);
    } catch (e) {
      try {
        return await this._extractMobile(url);
      } catch {
        throw e;
      }
    }
  }

  protected async _extractDesktop(url: string): Promise<VideoInfo> {
    const parsed = new URL(url);
    const startTime = int_or_none(parsed.searchParams.get('fromTime') ?? undefined) ?? undefined;

    const [rawUrl, smuggled] = unsmuggle_url(url, {});
    const m = this._match_valid_url(rawUrl)!;
    const videoId = m.groups!.id!;
    const isEmbed = !!m.groups!.embed;
    const mode = isEmbed ? 'videoembed' : 'video';

    const webpage = await this._download_webpage(`https://ok.ru/${mode}/${videoId}`, videoId, undefined, {
      headers: smuggled.referrer ? { Referer: String(smuggled.referrer) } : undefined,
    });

    const stubMatch = webpage.match(/class="vp_video_stub_txt"[^>]*>([\s\S]*?)<\//);
    const error = stubMatch?.[1]?.trim();
    if (
      error === 'The author of this video has not been found or is blocked' &&
      !smuggled.referrer &&
      mode === 'videoembed'
    ) {
      return this._extractDesktop(smuggle_url(url, { referrer: 'https://boosty.to' }));
    }
    if (error) throw new ExtractorError(error, { expected: true });
    if (webpage.includes('>Access to this video is restricted</div>')) this.raise_login_required();

    const playerRaw = this._search_regex(
      new RegExp(`data-options=(["'])(?<player>\\{[\\s\\S]+?${videoId}[\\s\\S]+?\\})\\1`),
      webpage,
      'player',
      null,
      true,
      'player',
    )!;
    const player = this._parse_json<Record<string, unknown>>(unescapeHTML(playerRaw), videoId)!;

    if (player.isExternalPlayer && player.url) {
      return this.url_result(String(player.url));
    }

    const flashvars = (player.flashvars as Record<string, unknown>) || {};
    let metadata: Record<string, unknown>;
    if (flashvars.metadata) {
      metadata = this._parse_json<Record<string, unknown>>(String(flashvars.metadata), videoId)!;
    } else {
      const data: Record<string, string> = {};
      if (flashvars.location) data['st.location'] = String(flashvars.location);
      metadata = await this._download_json<Record<string, unknown>>(
        decodeURIComponent(String(flashvars.metadataUrl)),
        videoId,
        'Downloading metadata JSON',
        { data: urlencodePostdata(data) },
      );
    }

    const movie = (metadata.movie as Record<string, unknown>) || {};
    const provider = metadata.provider as string | undefined;
    const title =
      provider === 'UPLOADED_ODKL'
        ? (movie.title as string)
        : (movie.title as string | undefined);

    const subtitles: Record<string, Subtitle[]> = {};
    for (const sub of (movie.subtitleTracks as Array<Record<string, unknown>>) || []) {
      const subUrl = sub.url as string | undefined;
      if (!subUrl) continue;
      const lang = String(sub.language || 'en');
      if (!subtitles[lang]) subtitles[lang] = [];
      subtitles[lang]!.push({ url: subUrl, ext: 'vtt' });
    }

    const info: VideoInfo = {
      id: videoId,
      title,
      thumbnail: movie.poster as string | undefined,
      duration: int_or_none(movie.duration) ?? undefined,
      upload_date: unified_strdate(this._html_search_meta('ya:ovs:upload_date', webpage, 'upload date', false)) ?? undefined,
      uploader: (metadata.author as Record<string, unknown> | undefined)?.name as string | undefined,
      uploader_id: (metadata.author as Record<string, unknown> | undefined)?.id as string | undefined,
      like_count: int_or_none(metadata.likeCount) ?? undefined,
      age_limit: this._html_search_meta('ya:ovs:adult', webpage, 'age limit', false) === 'true' ? 18 : 0,
      start_time: startTime,
      subtitles,
    };

    if (provider === 'USER_YOUTUBE') {
      return { ...info, _type: 'url_transparent', url: String(movie.contentId) };
    }

    if (!title) throw new ExtractorError('Unable to extract title', { expected: true });

    const formats: Format[] = [];
    for (const v of (metadata.videos as Array<Record<string, unknown>>) || []) {
      const vUrl = url_or_none(v.url);
      if (vUrl) formats.push({ url: vUrl, ext: 'mp4', format_id: String(v.name ?? 'mp4') });
    }

    const m3u8Url = url_or_none(metadata.hlsManifestUrl) || url_or_none(metadata.ondemandHls);
    if (m3u8Url) {
      formats.push(
        ...(await this._extract_m3u8_formats(
          m3u8Url,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
        )),
      );
      this._clearCookies(m3u8Url);
    }

    for (const [mpdId, mpdKey] of [
      ['dash', 'ondemandDash'],
      ['webm', 'metadataWebmUrl'],
    ] as const) {
      const mpdUrl = url_or_none(metadata[mpdKey]);
      if (mpdUrl) {
        formats.push(...(await this._extract_mpd_formats(mpdUrl, videoId, mpdId, undefined, false)));
        this._clearCookies(mpdUrl);
      }
    }

    for (const fmt of formats) {
      const fmtType = fmt.url?.match(/\btype[/=](\d)/)?.[1] ?? null;
      const q = qualityRank(fmtType);
      if (q != null) fmt.quality = q;
    }

    const liveM3u8 = url_or_none(metadata.hlsMasterPlaylistUrl);
    if (liveM3u8) {
      formats.push(
        ...(await this._extract_m3u8_formats(
          liveM3u8,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
        )),
      );
      this._clearCookies(liveM3u8);
    }
    const rtmpUrl = url_or_none(metadata.rtmpUrl);
    if (rtmpUrl) formats.push({ url: rtmpUrl, format_id: 'rtmp', ext: 'flv' });

    if (!formats.length && metadata.paymentInfo) {
      this.raise_no_formats('This video is paid, subscribe to download it', true);
    }

    info.formats = formats;
    return info;
  }

  protected async _extractMobile(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(`https://m.ok.ru/video/${videoId}`, videoId);

    const error = this._search_regex(
      /видео<\/a>\s*<div\s+class="empty">([\s\S]+?)<\/div>/,
      webpage,
      'error',
      null,
      false,
    );
    if (error) throw new ExtractorError(error, { expected: true });

    const jsonRaw = this._search_regex(/data-video="([\s\S]+?)"/, webpage, 'json data')!;
    const jsonData = this._parse_json<Record<string, unknown>>(unescapeHTML(jsonRaw), videoId) || {};
    const videoSrc = url_or_none(jsonData.videoSrc);
    if (!videoSrc) throw new ExtractorError('Unable to find video source', { expected: true });
    const redirectUrl = (await this._request_webpage(videoSrc, videoId, 'Requesting download URL'))!.url;
    this._clearCookies(redirectUrl);

    return {
      id: videoId,
      title: jsonData.videoName as string | undefined,
      duration: float_or_none(jsonData.videoDuration, 1000) ?? undefined,
      thumbnail: jsonData.videoPosterSrc as string | undefined,
      formats: [{ format_id: 'mobile', url: redirectUrl, ext: 'mp4' }],
    };
  }
}
