/** NiconicoChannelPlus* — ported from yt-dlp niconicochannelplus.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { filter_dict } from '../../utils';
import { int_or_none, str_or_none, traverse_obj, unified_timestamp, url_or_none } from '../../utils';

export class NiconicoChannelPlusBaseIE extends InfoExtractor {
  static IE_NAME = 'NiconicoChannelPlusBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _WEBPAGE_BASE_URL = 'https://nicochannel.jp';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NiconicoChannelPlusBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(path: string, itemId: string, opts: Record<string, unknown> = {}) {
    return this._download_json<Record<string, unknown>>(`https://nfc-api.nicochannel.jp/fc/${path}`, itemId, undefined, opts);
  }

  protected async _findFanclubSiteId(channelName: string): Promise<string> {
    const resp = await this._callApi('content_providers/channels', `channels/${channelName}`, {
      note: 'Fetching channel list',
    });
    const providers = traverse_obj(resp, ['data', 'content_providers']) as Array<Record<string, unknown>>;
    const id = providers?.find((v) => v.domain === `${NiconicoChannelPlusBaseIE._WEBPAGE_BASE_URL}/${channelName}`)?.id;
    if (!id) throw new ExtractorError(`Channel ${channelName} does not exist`, { expected: true });
    return String(id);
  }
}

export class NiconicoChannelPlusIE extends NiconicoChannelPlusBaseIE {
  static IE_NAME = 'NiconicoChannelPlus';
  static IE_DESC = 'ニコニコチャンネルプラス';
  static _VALID_URL =
    /https?:\/\/nicochannel\.jp\/(?<channel>[\w.-]+)\/(?:video|live)\/(?<code>sm\w+)/;

  protected async _getLiveStatusAndSessionId(contentCode: string, dataJson: Record<string, unknown>) {
    const videoType = dataJson.type;
    let liveStatus = 'not_live';
    let payload: Record<string, unknown> = {};
    if (videoType === 'vod') {
      liveStatus = dataJson.live_finished_at ? 'was_live' : 'not_live';
    } else if (videoType === 'live') {
      if (!dataJson.live_started_at) return ['is_upcoming', ''] as const;
      liveStatus = dataJson.live_finished_at ? 'was_live' : 'is_live';
      if (liveStatus === 'was_live') payload = { broadcast_type: 'dvr' };
    }
    const sessionResp = await this._callApi(`video_pages/${contentCode}/session_ids`, `${contentCode}/session`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
        'fc_use_device': 'null',
        origin: 'https://nicochannel.jp',
      },
    });
    return [liveStatus, String(traverse_obj(sessionResp, ['data', 'session_id']) ?? '')] as const;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const contentCode = m?.groups?.code ?? '';
    const channelId = m?.groups?.channel ?? '';
    await this._findFanclubSiteId(channelId);

    const dataResp = await this._callApi(`video_pages/${contentCode}`, contentCode, {
      headers: { fc_use_device: 'null' },
    });
    const dataJson = (traverse_obj(dataResp, ['data', 'video_page']) || {}) as Record<string, unknown>;
    const [liveStatus, sessionId] = await this._getLiveStatusAndSessionId(contentCode, dataJson);
    const releaseTs = str_or_none(dataJson.live_scheduled_start_at);

    let formats = [];
    if (liveStatus === 'is_upcoming') {
      throw new ExtractorError(
        `${releaseTs ? `This live event will begin at ${releaseTs} UTC` : 'This event has not started yet'} (${contentCode})`,
        { expected: true },
      );
    }
    const stream = (dataJson.video_stream as Record<string, unknown>) || {};
    const authUrl = String(stream.authenticated_url ?? '').replace('{session_id}', sessionId);
    formats = await this._extract_m3u8_formats(authUrl, contentCode);

    return {
      id: contentCode,
      formats,
      channel_id: channelId,
      channel_url: `${NiconicoChannelPlusBaseIE._WEBPAGE_BASE_URL}/${channelId}`,
      live_status: liveStatus,
      release_timestamp: unified_timestamp(releaseTs) ?? undefined,
      title: str_or_none(dataJson.title) ?? undefined,
      thumbnail: url_or_none(dataJson.thumbnail_url) ?? undefined,
      description: str_or_none(dataJson.description) ?? undefined,
      timestamp: unified_timestamp(dataJson.released_at) ?? undefined,
      duration: int_or_none(traverse_obj(dataJson, ['active_video_filename', 'length'])) ?? undefined,
      comment_count: int_or_none(traverse_obj(dataJson, ['video_aggregate_info', 'number_of_comments'])) ?? undefined,
      view_count: int_or_none(traverse_obj(dataJson, ['video_aggregate_info', 'total_views'])) ?? undefined,
      tags: ((traverse_obj(dataJson, ['video_tags']) as Array<{ tag?: string }>) || [])
        .map((t) => str_or_none(t.tag))
        .filter(Boolean) as string[],
    };
  }
}

export class NiconicoChannelPlusChannelBaseIE extends NiconicoChannelPlusBaseIE {
  static IE_NAME = 'NiconicoChannelPlusChannelBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _PAGE_SIZE = 12;

  protected async *_fetchPaged(path: string, query: Record<string, unknown>, channelName: string, page: number) {
    const response = await this._callApi(path, channelName, {
      query: { ...query, page: page + 1, per_page: NiconicoChannelPlusChannelBaseIE._PAGE_SIZE },
      headers: { fc_use_device: 'null' },
    });
    const list = traverse_obj(response, ['data', 'video_pages', 'list']) as Array<{ content_code?: string }> | undefined;
    for (const item of list || []) {
      const code = str_or_none(item.content_code);
      if (!code) continue;
      yield this.url_result(
        `${NiconicoChannelPlusBaseIE._WEBPAGE_BASE_URL}/${channelName}/video/${code}`,
        'NiconicoChannelPlus',
        code,
      );
    }
  }
}

export class NiconicoChannelPlusChannelVideosIE extends NiconicoChannelPlusChannelBaseIE {
  static IE_NAME = 'NiconicoChannelPlus:channel:videos';
  static _VALID_URL = /https?:\/\/nicochannel\.jp\/(?<id>[a-z\d._-]+)\/videos(?:\?.*)?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const fanclubSiteId = await this._findFanclubSiteId(channelId);
    const u = new URL(url);
    const query = filter_dict({
      tag: u.searchParams.get('tag') || undefined,
      sort: u.searchParams.get('sort') || '-released_at',
      vod_type: u.searchParams.get('vodType') || '0',
    });
    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      let count = 0;
      for await (const e of this._fetchPaged(`fanclub_sites/${fanclubSiteId}/video_pages`, query, channelId, page)) {
        entries.push(e);
        count++;
      }
      if (count < NiconicoChannelPlusChannelBaseIE._PAGE_SIZE) break;
    }
    return this.playlist_result(entries, `${channelId}-videos`, `${channelId}-videos`);
  }
}

export class NiconicoChannelPlusChannelLivesIE extends NiconicoChannelPlusChannelBaseIE {
  static IE_NAME = 'NiconicoChannelPlus:channel:lives';
  static _VALID_URL = /https?:\/\/nicochannel\.jp\/(?<id>[a-z\d._-]+)\/lives/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const fanclubSiteId = await this._findFanclubSiteId(channelId);
    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      let count = 0;
      for await (const e of this._fetchPaged(
        `fanclub_sites/${fanclubSiteId}/live_pages`,
        { live_type: 4 },
        channelId,
        page,
      )) {
        entries.push(e);
        count++;
      }
      if (count < NiconicoChannelPlusChannelBaseIE._PAGE_SIZE) break;
    }
    return this.playlist_result(entries, `${channelId}-lives`, `${channelId}-lives`);
  }
}
