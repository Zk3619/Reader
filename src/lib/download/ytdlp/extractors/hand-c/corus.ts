/**
 * CorusIE — ported from yt-dlp corus.py
 * Upstream subclasses ThePlatformFeedIE only for shared helpers; here it
 * stands alone since ThePlatform's TS port is a mechanical stub.
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext, dict_get, float_or_none, int_or_none } from '../../utils';

const SITE_MAP: Record<string, string> = {
  globaltv: 'series',
  etcanada: 'series',
  foodnetwork: 'food',
  bigbrothercanada: 'series',
  disneychannel: 'disneyen',
  disneylachaine: 'disneyfr',
};

/** Pragmatic subset of yt-dlp's `_parse_smil_formats` — video/audio elements only. */
async function parseSmilFormats(ie: InfoExtractor, smilXml: string, smilUrl: string, videoId: string): Promise<Format[]> {
  const formats: Format[] = [];
  const baseMatch = /<meta[^>]+(?:base|httpBase)=["']([^"']+)["']/i.exec(smilXml);
  const base = baseMatch?.[1] || smilUrl;
  const seen = new Set<string>();

  const mediaRe = /<(?:video|audio|media)\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = mediaRe.exec(smilXml))) {
    const attrs = m[1]!;
    const src = /\bsrc=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const bitrate = float_or_none(/\bsystem-bitrate=["']([^"']+)["']/i.exec(attrs)?.[1], 1000);
    const width = int_or_none(/\bwidth=["']([^"']+)["']/i.exec(attrs)?.[1]);
    const height = int_or_none(/\bheight=["']([^"']+)["']/i.exec(attrs)?.[1]);
    const srcUrl = (src.startsWith('http') ? src : new URL(src, `${base}/`).toString()).trim();
    const ext = determine_ext(srcUrl, undefined);

    if (ext === 'm3u8') {
      const fmts = await ie._extract_m3u8_formats(srcUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false);
      formats.push(...fmts);
    } else if (ext === 'mpd') {
      formats.push(...(await ie._extract_mpd_formats(srcUrl, videoId, 'dash', undefined, false)));
    } else if (srcUrl.startsWith('http')) {
      formats.push({
        url: srcUrl,
        ext: ext !== 'unknown' ? ext : 'flv',
        format_id: `http-${bitrate ?? formats.length}`,
        tbr: bitrate ?? undefined,
        width: width ?? undefined,
        height: height ?? undefined,
      });
    }
  }
  return formats;
}

export class CorusIE extends InfoExtractor {
  static IE_NAME = 'Corus';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<domain>(?:globaltv|etcanada|seriesplus|wnetwork|ytv)\.com|(?:hgtv|foodnetwork|slice|history|showcase|bigbrothercanada|abcspark|disney(?:channel|lachaine))\.ca)\/(?:[^/]+\/)*(?:video\.html\?.*?\bv=|videos?\/(?:[^/]+\/)*(?:[a-z0-9-]+-)?)(?<id>[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}|(?:[A-Z]{4})?\d{12,20})/;
  static _GEO_BYPASS = false;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const domain = m.groups!.domain!;
    const videoId = m.groups!.id!;
    const site = domain.split('.')[0]!;
    let path = SITE_MAP[site] || site;
    if (path !== 'series') path = `migration/${path}`;

    const list = await this._download_json<Record<string, unknown>[]>(
      `https://globalcontent.corusappservices.com/templates/${path}/playlist/`,
      videoId,
      undefined,
      { query: { byId: videoId }, headers: { Accept: 'application/json' } },
    );
    const video: Record<string, unknown> = (list && list[0]) || {};
    const title = String(video.title ?? '');

    const formats: Format[] = [];
    const sources = Array.isArray(video.sources) ? (video.sources as Record<string, unknown>[]) : [];
    for (const source of sources) {
      const smilUrl = source.file as string | undefined;
      if (!smilUrl) continue;
      const sourceType = source.type as string | undefined;
      const resp = await this._download_webpage(
        smilUrl,
        videoId,
        `Downloading${sourceType ? ` ${sourceType}` : ''} smil file`,
        { fatal: false, headers: this.geo_verification_headers() },
      );
      if (!resp) continue;
      const error = this._parse_json<Record<string, unknown>>(resp, videoId, null, false);
      if (error) {
        if (error.exception === 'GeoLocationBlocked') this.raise_geo_restricted('Geo restricted', ['CA']);
        throw new ExtractorError(String(error.description ?? 'Corus error'));
      }
      if (!resp.trimStart().startsWith('<')) continue;
      formats.push(...(await parseSmilFormats(this, resp, smilUrl, videoId)));
    }

    const subtitles: Record<string, Subtitle[]> = {};
    const tracks = Array.isArray(video.tracks) ? (video.tracks as Record<string, unknown>[]) : [];
    for (const track of tracks) {
      const trackUrl = track.file as string | undefined;
      if (!trackUrl) continue;
      const lang = site === 'disneylachaine' || site === 'seriesplus' ? 'fr' : 'en';
      (subtitles[lang] ||= []).push({ url: trackUrl, ext: determine_ext(trackUrl) });
    }

    const metadata = (video.metadata as Record<string, unknown>) || {};
    const getNumber = (key: string): number | null =>
      int_or_none((video[`pl1$${key}`] as unknown) ?? metadata[`${key}Number`]);

    return {
      id: videoId,
      title,
      formats,
      thumbnail: dict_get(video, ['defaultThumbnailUrl', 'thumbnail', 'image']) as string | undefined,
      description: (video.description as string) ?? undefined,
      timestamp: int_or_none(video.availableDate, 1000) ?? undefined,
      subtitles,
      duration: float_or_none(metadata.duration) ?? undefined,
      series: (dict_get(video, ['show', 'pl1$show']) as string) ?? undefined,
      season_number: getNumber('season') ?? undefined,
      episode_number: getNumber('episode') ?? undefined,
    };
  }
}
