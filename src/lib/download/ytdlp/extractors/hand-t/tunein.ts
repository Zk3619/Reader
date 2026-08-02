/**
 * TuneInBaseIE / TuneIn* — ported from yt-dlp tunein.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  join_nonempty,
  update_url_query,
  url_or_none,
  traverse_obj,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parseIso8601, protoRelative } from './_helpers';

export class TuneInBaseIE extends InfoExtractor {
  static _VALID_URL: RegExp | string | false | null = false;

  protected async _callApi(
    itemId: string,
    endpoint?: string,
    note = 'Downloading JSON metadata',
    fatal = false,
    query?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    return (
      (await this._download_json<Record<string, unknown>>(
        join_nonempty('https://api.tunein.com/profiles', itemId, endpoint, '/'),
        itemId,
        note,
        { fatal, query },
      )) || {}
    );
  }

  protected async _extractFormatsAndSubtitles(contentId: string) {
    const streams = await this._download_json<{ body?: unknown[] }>(
      'https://opml.radiotime.com/Tune.ashx',
      contentId,
      undefined,
      {
        query: { formats: 'mp3,aac,ogg,flash,hls', id: contentId, render: 'json' },
      },
    );
    const formats: Format[] = [];
    const subtitles: Record<string, import('../../types').Subtitle[]> = {};
    const body = streams.body;
    if (Array.isArray(body)) {
      for (const stream of body) {
        if (!stream || typeof stream !== 'object') continue;
        const rec = stream as Record<string, unknown>;
        const streamUrl = url_or_none(rec.url);
        if (!streamUrl) continue;
        if (rec.media_type === 'hls') {
          const res = await extractM3u8FormatsAndSubtitles(this, streamUrl, contentId);
          formats.push(...res.formats);
          mergeSubtitles(subtitles, res.subtitles);
        } else {
          formats.push({
            format_id: rec.media_type != null ? String(rec.media_type) : 'http',
            abr: int_or_none(rec.bitrate) ?? undefined,
            ext: rec.media_type != null ? String(rec.media_type) : undefined,
            url: protoRelative(streamUrl),
          });
        }
      }
    }
    return { formats, subtitles };
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TuneInBaseIE is not a standalone extractor', { expected: true });
  }
}

export class TuneInStationIE extends TuneInBaseIE {
  static IE_NAME = 'tunein:station';
  static _VALID_URL = /https?:\/\/tunein\.com\/radio\/[^/?#]+(?<id>s\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const stationId = this._match_id(url);
    const { formats, subtitles } = await this._extractFormatsAndSubtitles(stationId);
    const api = await this._callApi(stationId);
    const item = (api.Item as Record<string, unknown>) || {};
    return {
      id: stationId,
      formats,
      subtitles,
      title: clean_html(String(item.Title || stationId)) || undefined,
      alt_title: item.Subtitle ? clean_html(String(item.Subtitle)) : undefined,
      channel_follower_count: int_or_none(traverse_obj(item, ['Actions', 'Follow', 'FollowerCount'])) ?? undefined,
      description: item.Description ? clean_html(String(item.Description)) : undefined,
      is_live: traverse_obj(item, ['Actions', 'Play', 'IsLive']) === true,
      location: traverse_obj(item, ['Properties', 'Location', 'DisplayName']) != null
        ? String(traverse_obj(item, ['Properties', 'Location', 'DisplayName']))
        : undefined,
      thumbnail: url_or_none(item.Image) || undefined,
    };
  }
}

export class TuneInPodcastIE extends TuneInBaseIE {
  static IE_NAME = 'tunein:podcast:program';
  static _PAGE_SIZE = 20;
  static _VALID_URL = /https?:\/\/tunein\.com\/podcasts(?:\/[^/?#]+){1,2}(?<id>p\d+)/;

  static suitable(url: string): boolean {
    return TuneInPodcastEpisodeIE.suitable(url) ? false : super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const podcastId = this._match_id(url);
    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      const data = await this._callApi(podcastId, 'contents', `Downloading page ${page + 1}`, false, {
        filter: 't:free',
        limit: String(TuneInPodcastIE._PAGE_SIZE),
        offset: String(page * TuneInPodcastIE._PAGE_SIZE),
      });
      const items = (data.Items as unknown[]) || [];
      if (!items.length) break;
      for (const item of items) {
        const guideId = traverse_obj(item, ['GuideId']);
        if (!guideId) continue;
        const gid = String(guideId);
        entries.push(
          this.url_result(update_url_query(url, { topicId: gid.slice(1) }), 'TuneInPodcast', gid),
        );
      }
      if (items.length < TuneInPodcastIE._PAGE_SIZE) break;
    }
    const title = traverse_obj(await this._callApi(podcastId), ['Item', 'Title']);
    return this.playlist_result(entries, podcastId, title != null ? String(title) : undefined);
  }
}

export class TuneInPodcastEpisodeIE extends TuneInBaseIE {
  static IE_NAME = 'tunein:podcast';
  static _VALID_URL =
    /https?:\/\/tunein\.com\/podcasts(?:\/[^/?#]+){1,2}(?<series_id>p\d+)\/?\?(?:[^#]+&)?(?:topicid)=(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const seriesId = m.groups!.series_id!;
    const displayId = m.groups!.id!;
    const episodeId = `t${displayId}`;
    const { formats, subtitles } = await this._extractFormatsAndSubtitles(episodeId);
    const episodeApi = await this._callApi(episodeId);
    const item = (episodeApi.Item as Record<string, unknown>) || {};
    const seriesTitle = traverse_obj(await this._callApi(seriesId), ['Item', 'Title']);

    return {
      id: episodeId,
      display_id: displayId,
      formats,
      subtitles,
      series: seriesTitle ? clean_html(String(seriesTitle)) : undefined,
      series_id: seriesId,
      title: item.Title ? clean_html(String(item.Title)) : undefined,
      alt_title: item.Subtitle ? clean_html(String(item.Subtitle)) : undefined,
      description: item.Description ? clean_html(String(item.Description)) : undefined,
      duration: int_or_none(traverse_obj(item, ['Actions', 'Play', 'Duration'])) ?? undefined,
      thumbnail: url_or_none(item.Image) || undefined,
      timestamp: parseIso8601(traverse_obj(item, ['Actions', 'Play', 'PublishTime'])) ?? undefined,
    };
  }
}

export class TuneInEmbedIE extends TuneInBaseIE {
  static IE_NAME = 'tunein:embed';
  static _VALID_URL = /https?:\/\/tunein\.com\/embed\/player\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const embedId = this._match_id(url);
    const kindMap: Record<string, string> = { p: 'program', s: 'station', t: 'topic' };
    const kind = kindMap[embedId[0]!] || 'program';
    return this.url_result(`https://tunein.com/${kind}/?${kind}id=${embedId.slice(1)}`);
  }
}

export class TuneInShortenerIE extends InfoExtractor {
  static IE_NAME = 'tunein:shortener';
  static _VALID_URL = /https?:\/\/tun\.in\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const redirectId = this._match_id(url);
    const resp = await this._request_webpage(url, redirectId);
    if (!resp) throw new ExtractorError('TuneIn redirect failed', { expected: true });
    const finalUrl = new URL(resp.url);
    finalUrl.hostname = finalUrl.hostname || '';
    const newUrl = `${finalUrl.protocol}//${finalUrl.hostname}${finalUrl.pathname}${finalUrl.search}${finalUrl.hash}`;
    if (TuneInShortenerIE.suitable(newUrl)) {
      throw new ExtractorError(`Redirect loop for ${newUrl}`, { expected: true });
    }
    return this.url_result(newUrl);
  }
}
