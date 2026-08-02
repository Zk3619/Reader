/**

 * AsobiChannelIE / AsobiChannelTagURLIE — aligned with yt-dlp asobichannel.py

 */



import { InfoExtractor, ExtractorError } from '../../common';

import type { VideoInfo } from '../../types';

import { clean_html, merge_dicts, str_or_none, traverse_obj, url_or_none } from '../../utils';

import { searchNextjsData } from './_helpers';

import { parseIso8601 } from './helpers';



const MICROCMS_HEADER = { 'X-MICROCMS-API-KEY': 'qRaKehul9AHU8KtL0dnq1OCLKnFec6yrbcz3' };



export class AsobiChannelBaseIE extends InfoExtractor {

  static IE_NAME = 'AsobiChannelBase';

  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;



  async _real_extract(_url: string): Promise<VideoInfo> {

    throw new ExtractorError(`${this.constructor.name} is a base class`, { expected: true });

  }



  protected extractInfo(metadata: Record<string, unknown>): Partial<VideoInfo> {

    return {

      id: str_or_none(metadata.id) || undefined,

      title: str_or_none(metadata.title) || undefined,

      description: clean_html(metadata.body != null ? String(metadata.body) : null) || null,

      thumbnail: url_or_none(traverse_obj(metadata, ['contents', 'video_thumb', 'url'])) || undefined,

      timestamp: parseIso8601(metadata.publishedAt) ?? undefined,

      modified_timestamp: parseIso8601(metadata.updatedAt) ?? undefined,

      channel: str_or_none(traverse_obj(metadata, ['channel', 'name'])) || undefined,

      channel_id: str_or_none(traverse_obj(metadata, ['channel', 'id'])) || undefined,

    };

  }

}



export class AsobiChannelIE extends AsobiChannelBaseIE {

  static IE_NAME = 'asobichannel';

  static IE_DESC = 'ASOBI CHANNEL';

  static _VALID_URL = /https?:\/\/asobichannel\.asobistore\.jp\/watch\/(?<id>[\w-]+)/;



  private survapiHeader: Record<string, string> | null = null;



  private async ensureToken(): Promise<Record<string, string>> {

    if (this.survapiHeader) return this.survapiHeader;

    const token = await this._download_json<string>(

      'https://asobichannel-api.asobistore.jp/api/v1/vspf/token',

      undefined,

      'Retrieving API token',

    );

    this.survapiHeader = { Authorization: `Bearer ${token}` };

    return this.survapiHeader;

  }



  private async processVod(videoId: string, metadata: Record<string, unknown>): Promise<Partial<VideoInfo>> {

    const contentId = traverse_obj(metadata, ['contents', 'video_id']);

    const headers = await this.ensureToken();

    const vodData = await this._download_json<Record<string, unknown>>(

      `https://survapi.channel.or.jp/proxy/v1/contents/${contentId}/get_by_cuid`,

      videoId,

      'Downloading vod data',

      { headers },

    );

    const streamUrl = traverse_obj(vodData, ['ex_content', 'streaming_url']);

    return {

      formats: await this._extract_m3u8_formats(String(streamUrl), videoId),

    };

  }



  private async processLive(videoId: string, metadata: Record<string, unknown>): Promise<Partial<VideoInfo>> {

    const contentId = traverse_obj(metadata, ['contents', 'video_id']);

    const headers = await this.ensureToken();

    const eventData = await this._download_json<Record<string, unknown>>(

      `https://survapi.channel.or.jp/ex/events/${contentId}?embed=channel`,

      videoId,

      'Downloading event data',

      { headers },

    );

    const playerType = str_or_none(traverse_obj(eventData, ['data', 'Player_type']));

    if (playerType === 'poster') {

      this.raise_no_formats('Live event has not yet started', true);

      return { live_status: 'is_upcoming', formats: [] };

    }

    if (playerType === 'player') {

      const liveUrl = traverse_obj(eventData, ['data', 'Channel', 'Custom_live_url']);

      return {

        release_timestamp: parseIso8601(traverse_obj(metadata, ['period', 'start'])) ?? undefined,

        live_status: 'is_live',

        formats: await this._extract_m3u8_formats(String(liveUrl), videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false),

      };

    }

    throw new ExtractorError(`Unsupported player type ${JSON.stringify(playerType)}`, { expected: true });

  }



  async _real_extract(url: string): Promise<VideoInfo> {

    const videoId = this._match_id(url);

    const metadata = await this._download_json<Record<string, unknown>>(

      `https://channel.microcms.io/api/v1/media/${videoId}`,

      videoId,

      undefined,

      { headers: MICROCMS_HEADER },

    );

    const info = this.extractInfo(metadata);

    const videoType = str_or_none(traverse_obj(metadata, ['contents', 'video_type', 0]));

    if (videoType === 'VOD') return merge_dicts(info, await this.processVod(videoId, metadata)) as VideoInfo;

    if (videoType === 'LIVE') return merge_dicts(info, await this.processLive(videoId, metadata)) as VideoInfo;

    throw new ExtractorError(`Unexpected video type ${JSON.stringify(videoType)}`, { expected: true });

  }

}



export class AsobiChannelTagURLIE extends AsobiChannelBaseIE {

  static IE_NAME = 'asobichannel:tag';

  static IE_DESC = 'ASOBI CHANNEL';

  static _VALID_URL = /https?:\/\/asobichannel\.asobistore\.jp\/tag\/(?<id>[a-z0-9-_]+)/;



  async _real_extract(url: string): Promise<VideoInfo> {

    const tagId = this._match_id(url);

    const webpage = await this._download_webpage(url, tagId);

    const nextProps = searchNextjsData(this, webpage, tagId);

    const title = str_or_none(traverse_obj(nextProps, ['pageProps', 'data', 'name']));



    const media = await this._download_json<Record<string, unknown>>(

      `https://channel.microcms.io/api/v1/media?limit=999&filters=(tag[contains]${tagId})`,

      tagId,

      undefined,

      { headers: MICROCMS_HEADER },

    );



    const contents = traverse_obj(media, ['contents']);

    const items = Array.isArray(contents) ? contents : [];

    const entries = items

      .filter(

        (item): item is Record<string, unknown> =>

          !!item && typeof item === 'object' && !!str_or_none((item as Record<string, unknown>).id),

      )

      .map((metadata) =>

        merge_dicts(

          this.url_result(

            `https://asobichannel.asobistore.jp/watch/${metadata.id}`,

            'AsobiChannel',

            str_or_none(metadata.id),

          ),

          this.extractInfo(metadata),

        ) as VideoInfo,

      );



    return this.playlist_result(entries, tagId, title || tagId);

  }

}


