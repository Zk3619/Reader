/** Teamcoco family ù?ported from yt-dlp teamcoco.py */

import { ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  mimetype2ext,
  parse_qs,
  parse_duration,
  str_or_none,
  traverse_obj,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, make_archive_id, mergeSubtitles, searchNextjsData, urljoin } from './_helpers';
import { TurnerBaseIE } from './tbs';

const QUALITIES: Record<string, [number, number]> = {
  low: [480, 272],
  sd: [640, 360],
  hd: [1280, 720],
  uhd: [1920, 1080],
};

export class TeamcocoBaseIE extends TurnerBaseIE {
  static IE_NAME = 'teamcocobase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  protected async _getFormatsAndSubtitles(
    info: Record<string, unknown>,
    videoId: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    for (const src of (info.src as Array<Record<string, unknown>>) || []) {
      let formatId = str_or_none(src.label);
      let srcUrl = str_or_none(src.src);
      if (srcUrl?.match(/^https?:\/[^/]/)) srcUrl = srcUrl.replace(':/', '://');
      const ext = determine_ext(srcUrl || '', mimetype2ext(str_or_none(src.type)) ?? undefined);
      if (!formatId || !srcUrl) continue;
      if (formatId === 'hls' || ext === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, srcUrl, videoId, formatId);
        formats.push(...res.formats);
        subtitles = mergeSubtitles(subtitles, res.subtitles);
      } else if (formatId in QUALITIES) {
        if (srcUrl.startsWith('/mp4:protected/')) continue;
        const [w, h] = QUALITIES[formatId]!;
        formats.push({ url: srcUrl, ext, format_id: formatId, width: w, height: h });
      }
    }
    return { formats, subtitles };
  }
}

export class TeamcocoIE extends TeamcocoBaseIE {
  static IE_NAME = 'teamcoco';
  static _VALID_URL = /https?:\/\/(?:www\.)?teamcoco\.com\/(?<id>(?:[^/]+\/)*[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url).replace(/\//g, '_');
    const webpage = await this._download_webpage(url, displayId);
    const pageProps = searchNextjsData(this, webpage, displayId).pageProps as Record<string, unknown>;
    const data = (pageProps.pageData as Record<string, unknown>) || {};
    const blocks = (data.blocks as Array<Record<string, unknown>>) || [];
    const info: Record<string, unknown> = {};
    for (const block of blocks) {
      if (['meta-tags', 'video-player', 'video-info'].includes(String(block.name))) {
        Object.assign(info, block.props as Record<string, unknown>);
      }
    }

    const thumbRaw = str_or_none(info.image) || str_or_none(info.poster);
    const thumbnail = thumbRaw ? urljoin('https://teamcoco.com/', thumbRaw) : undefined;
    const videoId = parse_qs(thumbnail?.split('?')[1] || '').id?.[0] || displayId;
    const { formats, subtitles } = await this._getFormatsAndSubtitles(info, videoId);

    const desc = clean_html(String(info.descriptionHtml || info.description || '')) || undefined;
    const tsRaw = info.publishedOn ? `${info.publishedOn} 12:00AM` : null;

    return {
      id: videoId,
      display_id: displayId,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      thumbnail,
      title: str_or_none(info.title) ?? displayId,
      description: desc,
      timestamp: unified_timestamp(tsRaw) ?? undefined,
    };
  }
}

const GRAPHQL_QUERY = `query find($id: ID!) {
  findRecord(id: $id) {
    ... on MetaInterface {
      id
      title
      teaser
      publishOn
      slug
      thumb { ... on FileInterface { id path preview mime } }
    }
    ... on Video {
      videoType
      duration
      isLive
      youtubeId
      turnerMediaId
      turnerMediaAuthToken
      airDate
    }
    ... on Episode {
      airDate
      seasonNumber
      episodeNumber
      guestNames
    }
  }
  findRecordVideoMetadata(id: $id) {
    turnerMediaId
    turnerMediaAuthToken
    duration
    src
  }
}`;

export class ConanClassicIE extends TeamcocoBaseIE {
  static IE_NAME = 'conanclassic';
  static _VALID_URL = /https?:\/\/(?:(?:www\.)?conanclassic|conan25\.teamcoco)\.com\/(?<id>(?:[^/]+\/)*[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const pageProps = searchNextjsData(this, webpage, displayId).pageProps as Record<string, unknown>;
    const data = (pageProps.pageData as Record<string, unknown>) || {};
    let videoId: string | undefined;
    for (const block of (data.blocks as Array<Record<string, unknown>>) || []) {
      const props = block.props as Record<string, unknown>;
      const fields = props?.fields as Record<string, unknown> | undefined;
      if (fields?.incomingVideoRecord) {
        videoId = str_or_none((fields.incomingVideoRecord as Record<string, unknown>).id) ?? undefined;
        break;
      }
      for (const fd of (props?.fieldDefs as Array<Record<string, unknown>>) || []) {
        if (fd.name === 'incomingVideoId') videoId = str_or_none(fd.value) ?? undefined;
      }
    }
    if (!videoId) this.raise_no_formats('Unable to extract video ID from webpage', true);

    const response = await this._download_json<Record<string, unknown>>(
      'https://conanclassic.com/api/legacy/graphql',
      videoId!,
      undefined,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ query: GRAPHQL_QUERY, variables: { id: videoId } }),
      },
    );

    const record = traverse_obj(response, ['data', 'findRecord']) as Record<string, unknown>;
    const info: Partial<VideoInfo> = {
      title: str_or_none(record?.title) ?? undefined,
      description: str_or_none(record?.teaser) ?? undefined,
      thumbnail: url_or_none(traverse_obj(record, ['thumb', 'preview'])) ?? undefined,
      duration: parse_duration(record?.duration) ?? undefined,
      timestamp: unified_timestamp(record?.publishOn) ?? undefined,
    };

    const mediaId = str_or_none(
      traverse_obj(response, ['data', 'findRecord', 'turnerMediaId']) ||
        traverse_obj(response, ['data', 'findRecordVideoMetadata', 'turnerMediaId']),
    );
    if (mediaId) {
      const token = str_or_none(
        traverse_obj(response, ['data', 'findRecord', 'turnerMediaAuthToken']) ||
          traverse_obj(response, ['data', 'findRecordVideoMetadata', 'turnerMediaAuthToken']),
      );
      if (!token) throw new ExtractorError('No Turner Media auth token found in API response', { expected: true });
      Object.assign(info, await this._extractNgtvInfo(mediaId, { accessToken: token, accessTokenType: 'jws' }, null, {}));
    } else {
      const meta = traverse_obj(response, ['data', 'findRecordVideoMetadata']) as Record<string, unknown>;
      const streams = await this._getFormatsAndSubtitles(meta || {}, videoId!);
      Object.assign(info, streams);
    }

    return {
      id: videoId!,
      display_id: displayId,
      _old_archive_ids: [make_archive_id('Teamcoco', videoId!)],
      ...info,
    };
  }
}
