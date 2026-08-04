// @ts-nocheck
/** YleAreenaIE â€?ported from yt-dlp yle_areena.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { int_or_none, smuggle_url, traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parse_iso8601 } from './_helpers';

export class YleAreenaIE extends InfoExtractor {
  static IE_NAME = 'YleAreena';
  static _VALID_URL = /https?:\/\/areena\.yle\.fi\/(?<podcast>podcastit\/)?(?<id>[\d-]+)/;
  static _GEO_COUNTRIES = ['FI'];

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const isPodcast = !!m.groups!.podcast;

    const webpage = await this._download_webpage(url, videoId);
    const jsonLd = this._search_json_ld(webpage, videoId, { fatal: false }) || {};
    const videoData = (
      await this._download_json<{ data: Record<string, unknown> }>(
        `https://player.api.yle.fi/v1/preview/${videoId}.json?app_id=player_static_prod&app_key=8930d72170e48303cf5f3867780d549b`,
        videoId,
        undefined,
        {
          headers: {
            origin: 'https://areena.yle.fi',
            referer: 'https://areena.yle.fi/',
            'content-type': 'application/json',
          },
        },
      )
    ).data;

    const titleLd = (jsonLd.title as string) || '';
    const epMeta = titleLd.match(
      /K(?<season_no>\d+),\s*J(?<episode_no>\d+):?\s*\b(?<episode>[^|]+)\s*\|\s*(?<series>.+)/,
    );
    const seasonNumber = epMeta?.groups?.season_no ?? null;
    const episodeNumber = epMeta?.groups?.episode_no ?? null;
    const episode = epMeta?.groups?.episode?.trim() ?? null;
    const series = epMeta?.groups?.series?.trim() ?? null;

    const description = traverse_obj(videoData, [
      'ongoing_ondemand',
      'description',
      'fin',
    ]) as string | undefined;

    const subtitles: Record<string, Subtitle[]> = {};
    const subsList =
      (traverse_obj(videoData, ['ongoing_ondemand', 'subtitles']) as Array<
        Record<string, unknown>
      >) || [];
    for (const sub of subsList) {
      const uri = url_or_none(sub.uri);
      if (!uri) continue;
      const lang = (sub.language as string) || 'und';
      (subtitles[lang] ||= []).push({
        url: uri,
        ext: 'srt',
        name: sub.kind != null ? String(sub.kind) : undefined,
      });
    }

    let infoDict: Partial<VideoInfo> = {};
    let metadata: Record<string, unknown> = {};

    if (isPodcast && url_or_none(traverse_obj(videoData, ['ongoing_ondemand', 'media_url']))) {
      metadata = (videoData.ongoing_ondemand as Record<string, unknown>) || {};
      infoDict.url = String(metadata.media_url);
    } else if (url_or_none(traverse_obj(videoData, ['ongoing_event', 'manifest_url']))) {
      metadata = { ...(videoData.ongoing_event as Record<string, unknown>) };
      delete metadata.duration;
      infoDict.live_status = 'is_live';
    } else if (url_or_none(traverse_obj(videoData, ['ongoing_ondemand', 'manifest_url']))) {
      metadata = (videoData.ongoing_ondemand as Record<string, unknown>) || {};
    } else if (traverse_obj(videoData, ['ongoing_ondemand', 'kaltura', 'id'])) {
      metadata = (videoData.ongoing_ondemand as Record<string, unknown>) || {};
      const kalturaId = String(
        (traverse_obj(videoData, ['ongoing_ondemand', 'kaltura', 'id']) as string) || '',
      );
      infoDict = {
        _type: 'url_transparent',
        url: smuggle_url(`kaltura:1955031:${kalturaId}`, { source_url: url }),
        ie_key: 'Kaltura',
      };
    } else if (videoData.gone && typeof videoData.gone === 'object') {
      this.raise_no_formats('The content is no longer available', true);
    } else {
      throw new ExtractorError('Unable to extract content');
    }

    if (!infoDict.url && metadata.manifest_url) {
      const { formats, subtitles: subs } = await extractM3u8FormatsAndSubtitles(
        this,
        String(metadata.manifest_url),
        videoId,
        'hls',
      );
      infoDict.formats = formats;
      mergeSubtitles(subtitles, subs);
    }

    const seasonFromDesc = int_or_none(
      this._search_regex(/Kausi (\d+)/, description || '', 'season number', null, false),
    );

    const thumbs = jsonLd.thumbnails;
    const thumbUrl = Array.isArray(thumbs)
      ? String((thumbs[0] as Record<string, unknown>)?.url || '') || undefined
      : undefined;

    return {
      id: videoId,
      title:
        (traverse_obj(metadata, ['title', 'fin']) as string) ||
        episode ||
        (jsonLd.title as string) ||
        videoId,
      description:
        (traverse_obj(metadata, ['description', 'fin']) as string) || description || undefined,
      series:
        (traverse_obj(metadata, ['series', 'title', 'fin']) as string) || series || undefined,
      season_number: seasonFromDesc ?? int_or_none(seasonNumber) ?? undefined,
      episode_number:
        int_or_none(traverse_obj(metadata, ['episode_number'])) ??
        int_or_none(episodeNumber) ??
        undefined,
      age_limit:
        int_or_none(
          traverse_obj(metadata, ['content_rating', 'age_restriction']),
        ) ?? undefined,
      release_timestamp: parse_iso8601(metadata.start_time) ?? undefined,
      duration:
        int_or_none(traverse_obj(metadata, ['duration', 'duration_in_seconds'])) ?? undefined,
      thumbnail: thumbUrl,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      ...infoDict,
    };
  }
}
