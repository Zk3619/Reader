/** OlympicsReplayIE — ported from yt-dlp olympics.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { int_or_none, parse_qs, traverse_obj, update_url_query, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601, searchNextjsData } from './_helpers';

export class OlympicsReplayIE extends InfoExtractor {
  static IE_NAME = 'olympics';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?olympics\.com\/[a-z]{2}\/(?:paris-2024\/)?(?:replay|videos?|original-series\/episode)\/(?<id>[\w-]+)/;
  static _GEO_BYPASS = false;

  protected async _extractFromNextjsData(webpage: string, videoId: string): Promise<VideoInfo | null> {
    const data = traverse_obj(searchNextjsData(this, webpage, videoId), [
      'pageProps',
      'page',
      'items',
    ]) as Array<Record<string, unknown>> | undefined;
    const current = data?.find((v) => v.name === 'videoPlaylist');
    const videoData = traverse_obj(current, ["data", "currentVideo"]) as Record<string, unknown> | undefined;
    if (!videoData) return null;

    const geoCountries = traverse_obj(videoData, 'countries') as string[] | undefined;
    if (videoData.geoRestrictedVideo) this.raise_geo_restricted(undefined, geoCountries);

    const isLive = videoData.streamingStatus === 'LIVE';
    const m3u8Url =
      url_or_none(videoData.videoUrl as string) || (videoData.streamUrl as string | undefined);
    if (!m3u8Url) return null;

    const tokenizedUrl = await this._tokenizeUrl(m3u8Url, String(videoData.jwtToken ?? ''), isLive, videoId);
    let formats: VideoInfo['formats'];
    let subtitles: VideoInfo['subtitles'];
    try {
      ({ formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, tokenizedUrl, videoId, 'hls'));
    } catch (e) {
      const err = e as { cause?: { msg?: string } };
      if (err.cause?.msg?.includes('georestricted')) this.raise_geo_restricted(undefined, geoCountries);
      throw e;
    }

    return {
      formats,
      subtitles,
      is_live: isLive,
      id: String(videoData.videoID ?? videoId),
      title: videoData.title as string | undefined,
      timestamp: parseIso8601(videoData.contentDate) ?? undefined,
    };
  }

  protected async _tokenizeUrl(url: string, token: string, isLive: boolean, videoId: string): Promise<string> {
    const resp = await this._download_json<{ data?: { url?: string } }>(
      'https://metering.olympics.com/tokengenerator',
      videoId,
      'Downloading tokenized m3u8 url',
      {
        query: {
          ...parse_qs(url),
          url: update_url_query(url, {}),
          'service-id': isLive ? 'live' : 'vod',
          'user-auth': token,
        },
      },
    );
    return resp.data?.url || url;
  }

  protected async _legacyTokenizeUrl(url: string, videoId: string): Promise<string> {
    const resp = await this._download_json<{ url?: string }>(
      'https://olympics.com/tokenGenerator',
      videoId,
      'Downloading legacy tokenized m3u8 url',
      { query: { url } },
    );
    return resp.url || url;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const nextInfo = await this._extractFromNextjsData(webpage, videoId);
    if (nextInfo) return nextInfo;

    const title =
      this._html_search_meta(['title', 'og:title', 'twitter:title'], webpage) || undefined;
    const videoUuid = this._html_search_meta('episode_uid', webpage) || videoId;
    const m3u8Url = this._html_search_meta('video_url', webpage);
    if (!m3u8Url) throw new ExtractorError('Unable to extract video URL', { expected: true });

    const jsonLd = this._search_json_ld(webpage, videoUuid) || {};
    let thumbnailsList = jsonLd.image as string[] | string | undefined;
    if (!thumbnailsList) {
      const imagesRaw =
        this._html_search_regex(/["']image["']:\s*["']([^"']+)["']/, webpage, 'images', null, false) || '';
      thumbnailsList = imagesRaw.replace('[', '').replace(']', '').split(',').map((t) => t.trim());
    }
    const thumbArr = Array.isArray(thumbnailsList) ? thumbnailsList : [thumbnailsList].filter(Boolean);
    const thumbnails: Thumbnail[] = [];
    for (const thumbnail of thumbArr) {
      const tm = String(thumbnail).match(
        /\/images\/image\/private\/t_(?<width_a>\d+)-(?<height_a>\d+)_(?<width>\d+)\/primary\/[\W\w\d]+/,
      );
      const widthA = int_or_none(tm?.groups?.width_a);
      const heightA = int_or_none(tm?.groups?.height_a);
      const width = int_or_none(tm?.groups?.width);
      thumbnails.push({
        url: String(thumbnail),
        width: width ?? undefined,
        height: width && widthA && heightA ? int_or_none((width * heightA) / widthA) ?? undefined : undefined,
      });
    }

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      await this._legacyTokenizeUrl(m3u8Url, videoUuid),
      videoUuid,
      'hls',
    );

    return {
      id: videoUuid,
      title,
      thumbnails,
      formats,
      subtitles,
      ...jsonLd,
    };
  }
}
