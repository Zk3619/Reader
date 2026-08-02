/**
 * TurnerBaseIE — ported from yt-dlp turner.py (AdobePass simplified)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  parse_duration,
} from '../../utils';
import { strip_or_none } from './_helpers';

const AKAMAI_SPE_TOKEN_CACHE: Record<string, string> = {};

export class TurnerBaseIE extends InfoExtractor {
  static IE_NAME = 'turnerbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TurnerBaseIE is not a standalone extractor', { expected: true });
  }

  protected _extractTimestamp(videoData: string): number | undefined {
    const m = videoData.match(/dateCreated=["']([^"']+)["']/i);
    if (!m) return undefined;
    const uts = videoData.match(new RegExp(`${m[0]}[^>]*uts=["'](\\d+)["']`, 'i'));
    return int_or_none(uts?.[1]) ?? undefined;
  }

  protected async _addAkamaiSpeToken(
    tokenizerSrc: string,
    videoUrl: string,
    contentId: string,
    apData: { auth_required?: boolean } = {},
    softwareStatement?: string,
    customTokenizerQuery?: Record<string, string>,
  ): Promise<string> {
    const securePathMatch = videoUrl.match(/https?:\/\/[^/]+(.+\/)/);
    const securePath = `${securePathMatch?.[1] || '/'}*`;
    let token = AKAMAI_SPE_TOKEN_CACHE[securePath];
    if (!token) {
      const query: Record<string, string> = { path: securePath, ...(customTokenizerQuery || {}), videoId: contentId };
      if (apData.auth_required) {
        this.report_warning('Auth-required Turner stream; token may fail without AdobePass');
      }
      void softwareStatement;
      const authText = await this._download_webpage(tokenizerSrc, contentId, undefined, { query });
      const tokenMatch = authText.match(/<token>([^<]+)<\/token>/i) || authText.match(/<msg>([^<]+)<\/msg>/i);
      if (tokenMatch?.[1]?.includes('error')) {
        throw new ExtractorError(tokenMatch[1], { expected: true });
      }
      token = tokenMatch?.[1]?.trim() || '';
      if (token) AKAMAI_SPE_TOKEN_CACHE[securePath] = token;
    }
    if (!token) return videoUrl;
    return `${videoUrl}?hdnea=${token}`;
  }

  protected async _extractCvpInfo(
    dataSrc: string,
    videoId: string,
    _softwareStatement?: string,
    pathData: Record<string, Record<string, string>> = {},
    apData: { auth_required?: boolean } = {},
    fatal = false,
  ): Promise<Partial<VideoInfo>> {
    const videoData = await this._download_webpage(dataSrc, videoId, undefined, { fatal });
    if (!videoData) return {};

    const idMatch = videoData.match(/\bid=["']([^"']+)["']/);
    const resolvedId = idMatch?.[1] || videoId;
    const headline = videoData.match(/<headline[^>]*>([\s\S]*?)<\/headline>/i)?.[1];
    const title = strip_or_none(headline);
    if (!title && fatal) throw new ExtractorError('Turner headline missing', { expected: true });

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const thumbnails: Thumbnail[] = [];
    const urls = new Set<string>();
    const rex = /(?<width>[0-9]+)x(?<height>[0-9]+)(?:_(?<bitrate>[0-9]+))?/;

    for (const fileMatch of videoData.matchAll(/<file\b([^>]*)>([\s\S]*?)<\/file>/gi)) {
      const attrs = fileMatch[1] || '';
      const videoUrl = strip_or_none(fileMatch[2]);
      if (!videoUrl || urls.has(videoUrl)) continue;
      urls.add(videoUrl);
      const formatId = attrs.match(/\bbitrate=["']([^"']+)["']/i)?.[1];
      const ext = determine_ext(videoUrl);
      let resolvedUrl = videoUrl;
      if (videoUrl.startsWith('/secure/')) {
        const secure = pathData.secure;
        if (!secure) continue;
        resolvedUrl = await this._addAkamaiSpeToken(
          secure.tokenizer_src,
          secure.media_src + videoUrl,
          resolvedId,
          apData,
        );
      } else if (!/^https?:\/\//.test(videoUrl)) {
        const base = pathData[ext]?.media_src || pathData.default?.media_src;
        if (!base) continue;
        resolvedUrl = base + videoUrl;
      }
      if (['scc', 'srt', 'vtt'].includes(ext)) {
        (subtitles.en ||= []).push({ ext, url: resolvedUrl });
      } else if (ext === 'png') {
        thumbnails.push({ id: formatId, url: resolvedUrl });
      } else if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(resolvedUrl, resolvedId, 'mp4', 'm3u8_native', undefined, undefined, formatId || 'hls', undefined, false)),
        );
      } else {
        const f: Format = { format_id: formatId || ext || 'http', url: resolvedUrl, ext };
        const mobj = resolvedUrl.match(rex);
        if (mobj?.groups) {
          f.width = int_or_none(mobj.groups.width) ?? undefined;
          f.height = int_or_none(mobj.groups.height) ?? undefined;
          f.tbr = int_or_none(mobj.groups.bitrate) ?? undefined;
        }
        formats.push(f);
      }
    }

    return {
      id: resolvedId,
      title: title || undefined,
      formats,
      subtitles,
      thumbnails,
      thumbnail: strip_or_none(videoData.match(/<poster[^>]*>([\s\S]*?)<\/poster>/i)?.[1]) || undefined,
      description: strip_or_none(videoData.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]) || undefined,
      duration:
        parse_duration(videoData.match(/<length[^>]*>([\s\S]*?)<\/length>/i)?.[1]) ??
        parse_duration(videoData.match(/<trt[^>]*>([\s\S]*?)<\/trt>/i)?.[1]) ??
        undefined,
      timestamp: this._extractTimestamp(videoData),
      series: strip_or_none(videoData.match(/<showTitle[^>]*>([\s\S]*?)<\/showTitle>/i)?.[1]) || undefined,
      season_number: int_or_none(videoData.match(/<seasonNumber[^>]*>([\s\S]*?)<\/seasonNumber>/i)?.[1]) ?? undefined,
      episode_number: int_or_none(videoData.match(/<episodeNumber[^>]*>([\s\S]*?)<\/episodeNumber>/i)?.[1]) ?? undefined,
      is_live: /<isLive[^>]*>true<\/isLive>/i.test(videoData),
    };
  }

  protected async _extractNgtvInfo(
    mediaId: string,
    tokenizerQuery: Record<string, string>,
    apData: { auth_required?: boolean; is_live?: boolean } = {},
  ): Promise<Partial<VideoInfo>> {
    const streamsData = (
      await this._download_json<{ media: { tv: Record<string, Record<string, unknown>> } }>(
        `https://medium.ngtv.io/media/${mediaId}/tv`,
        mediaId,
      )
    ).media.tv;

    let duration: number | undefined;
    const formats: Format[] = [];
    for (const supportedType of ['unprotected', 'bulkaes'] as const) {
      const streamData = streamsData[supportedType] || {};
      let m3u8Url = String(streamData.secureUrl || streamData.url || '');
      if (!m3u8Url) continue;
      if (streamData.playlistProtection === 'spe') {
        m3u8Url = await this._addAkamaiSpeToken(
          'https://token.ngtv.io/token/token_spe',
          m3u8Url,
          mediaId,
          apData,
          undefined,
          tokenizerQuery,
        );
      }
      formats.push(
        ...(await this._extract_m3u8_formats(
          m3u8Url,
          mediaId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
        )),
      );
      duration = float_or_none(streamData.totalRuntime) ?? duration;
    }
    return { formats, duration };
  }
}
