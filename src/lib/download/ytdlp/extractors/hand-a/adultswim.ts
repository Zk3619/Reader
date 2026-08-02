/**
 * AdultSwimIE — aligned with yt-dlp adultswim.py + turner._extract_ngtv_info
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  mimetype2ext,
  str_or_none,
  try_get,
  update_url_query,
} from '../../utils';

const AKAMAI_SPE_TOKEN_CACHE: Record<string, string> = {};

abstract class TurnerBaseIE extends InfoExtractor {
  async _addAkamaiSpeToken(
    videoUrl: string,
    contentId: string,
    tokenizerQuery: Record<string, string>,
    authRequired = false,
  ): Promise<string> {
    const securePathMatch = videoUrl.match(/https?:\/\/[^/]+(.+\/)/);
    const securePath = `${securePathMatch?.[1] || '/'}*`;
    let token = AKAMAI_SPE_TOKEN_CACHE[securePath];
    if (!token) {
      const query: Record<string, string> = { path: securePath, ...tokenizerQuery, videoId: contentId };
      if (authRequired) {
        this.report_warning('Auth-required Turner stream; token may fail without AdobePass');
      }
      const authText = await this._download_webpage(
        'https://token.ngtv.io/token/token_spe',
        contentId,
        undefined,
        { query },
      );
      const tokenMatch = authText.match(/<token>([^<]+)<\/token>/);
      token = tokenMatch?.[1]?.trim() || '';
      if (token) AKAMAI_SPE_TOKEN_CACHE[securePath] = token;
    }
    if (!token) return videoUrl;
    return update_url_query(videoUrl, { hdnea: token });
  }

  async _extractNgtvInfo(
    mediaId: string,
    tokenizerQuery: Record<string, string>,
    apData: { auth_required?: boolean; is_live?: boolean } = {},
  ): Promise<Partial<VideoInfo>> {
    const streamsData = await this._download_json<{
      media: { tv: Record<string, Record<string, unknown>> };
    }>(`https://medium.ngtv.io/media/${mediaId}/tv`, mediaId);

    let duration: number | null = null;
    const formats: Format[] = [];

    for (const supportedType of ['unprotected', 'bulkaes'] as const) {
      const streamData = streamsData.media.tv[supportedType] || {};
      let m3u8Url = String(streamData.secureUrl || streamData.url || '');
      if (!m3u8Url) continue;
      if (streamData.playlistProtection === 'spe') {
        m3u8Url = await this._addAkamaiSpeToken(
          m3u8Url,
          mediaId,
          tokenizerQuery,
          !!apData.auth_required,
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

    return { formats, duration: duration ?? undefined };
  }
}

function parseIso8601(s: unknown): number | null {
  if (s == null) return null;
  const t = Date.parse(String(s));
  return Number.isFinite(t) ? Math.trunc(t / 1000) : null;
}

function parseAgeLimit(rating: unknown): number | null {
  if (rating == null) return null;
  const s = String(rating).toUpperCase();
  if (s.includes('TV-MA') || s.includes('NC-17') || s.includes('R')) return 17;
  if (s.includes('TV-14') || s.includes('PG-13')) return 14;
  if (s.includes('TV-PG') || s.includes('PG')) return 13;
  return 0;
}

function stripOrNone(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export class AdultSwimIE extends TurnerBaseIE {
  static IE_NAME = 'adultswim';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?adultswim\.com\/videos\/(?<show_path>[^/?#]+)(?:\/(?<episode_path>[^/?#]+))?/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const showPath = m.groups!.show_path!;
    const episodePath = m.groups!.episode_path;
    const displayId = episodePath || showPath;

    const query = episodePath
      ? `query {
  getShowBySlug(slug:"${showPath}") {
    title
    getVideoBySlug(slug:"${episodePath}") {
      _id
      auth
      description
      duration
      episodeNumber
      launchDate
      mediaID
      seasonNumber
      poster
      title
      tvRating
    }
  }
}`
      : `query {
  getShowBySlug(slug:"${showPath}") {
    metaDescription
    title
    videos(first:1000,sort:["episode_number"]) {
      edges {
        node {
           _id
           slug
        }
      }
    }
  }
}`;

    const resp = await this._download_json<{ data: { getShowBySlug: Record<string, unknown> } }>(
      'https://www.adultswim.com/api/search',
      displayId,
      'Downloading AdultSwim GraphQL',
      {
        method: 'POST',
        data: JSON.stringify({ query }),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    const showData = resp.data.getShowBySlug;

    if (episodePath) {
      const videoData = showData.getVideoBySlug as Record<string, unknown>;
      const videoId = String(videoData._id || displayId);
      const episodeTitle = String(videoData.title || displayId);
      const series = stripOrNone(showData.title);
      const title = series ? `${series} - ${episodeTitle}` : episodeTitle;

      const info: VideoInfo = {
        id: videoId,
        title,
        description: stripOrNone(videoData.description),
        duration: float_or_none(videoData.duration) ?? undefined,
        formats: [],
        subtitles: {},
        age_limit: parseAgeLimit(videoData.tvRating) ?? undefined,
        thumbnail: str_or_none(videoData.poster) || undefined,
        timestamp: parseIso8601(videoData.launchDate) ?? undefined,
        series: series || undefined,
        season_number: int_or_none(videoData.seasonNumber) ?? undefined,
        episode: episodeTitle,
        episode_number: int_or_none(videoData.episodeNumber) ?? undefined,
        webpage_url: url,
        original_url: url,
        extractor: AdultSwimIE.IE_NAME,
        extractor_key: 'AdultSwim',
      };

      const auth = !!videoData.auth;
      const mediaId = str_or_none(videoData.mediaID);
      if (mediaId) {
        const ngtv = await this._extractNgtvInfo(mediaId, {
          appId:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBJZCI6ImFzLXR2ZS1kZXNrdG9wLXB0enQ2bSIsInByb2R1Y3QiOiJ0dmUiLCJuZXR3b3JrIjoiYXMiLCJwbGF0Zm9ybSI6ImRlc2t0b3AiLCJpYXQiOjE1MzI3MDIyNzl9.BzSCk-WYOZ2GMCIaeVb8zWnzhlgnXuJTCu0jGp_VaZE',
        }, { auth_required: auth });
        Object.assign(info, ngtv);
      }

      if (!auth) {
        const extractData = await this._download_json<Record<string, unknown>>(
          `https://www.adultswim.com/api/shows/v1/videos/${videoId}`,
          videoId,
          undefined,
          { query: { fields: 'stream' }, fatal: false },
        );
        const assets =
          (try_get(extractData, (x: Record<string, unknown>) => {
            const data = x.data as Record<string, unknown> | undefined;
            const video = data?.video as Record<string, unknown> | undefined;
            const stream = video?.stream as Record<string, unknown> | undefined;
            return stream?.assets;
          }) as Record<string, unknown>[] | null) || [];

        for (const asset of assets) {
          const assetUrl = str_or_none(asset.url);
          if (!assetUrl) continue;
          const ext = determine_ext(assetUrl, mimetype2ext(String(asset.mime_type || '')) || undefined);
          if (ext === 'm3u8') {
            info.formats!.push(
              ...(await this._extract_m3u8_formats(
                assetUrl,
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
          } else if (['scc', 'ttml', 'vtt'].includes(ext)) {
            (info.subtitles!.en ||= []).push({ url: assetUrl, ext });
          }
        }
      }

      return info;
    }

    const entries: VideoInfo[] = [];
    const edges =
      ((showData.videos as Record<string, unknown>)?.edges as Record<string, unknown>[]) || [];
    for (const edge of edges) {
      const video = (edge.node as Record<string, unknown>) || {};
      const slug = str_or_none(video.slug);
      if (!slug) continue;
      entries.push(
        this.url_result(
          `http://adultswim.com/videos/${showPath}/${slug}`,
          'AdultSwim',
          str_or_none(video._id) || slug,
        ),
      );
    }

    return this.playlist_result(
      entries,
      showPath,
      str_or_none(showData.title),
      stripOrNone(showData.metaDescription),
    );
  }
}
