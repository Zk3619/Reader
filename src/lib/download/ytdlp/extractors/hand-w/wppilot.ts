// @ts-nocheck
/** WPPilotBaseIE / WPPilotIE / WPPilotChannelsIE â€?ported from yt-dlp wppilot.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { try_get } from '../../utils';

type ChannelNode = Record<string, unknown>;

const channelListCache = new Map<string, ChannelNode[]>();

export class WPPilotBaseIE extends InfoExtractor {
  static IE_NAME = 'wppilot:base';
  static _VALID_URL = false as const;

  static _VIDEO_URL = 'https://pilot.wp.pl/api/v1/channel/%s';
  static _VIDEO_GUEST_URL = 'https://pilot.wp.pl/api/v1/guest/channel/%s';
  static _HEADERS_WEB: Record<string, string> = {
    'Content-Type': 'application/json; charset=UTF-8',
    Referer: 'https://pilot.wp.pl/tv/',
  };

  protected async _getChannelList(cache = true): Promise<[ChannelNode[], boolean]> {
    if (cache) {
      const cached = channelListCache.get('channel-list');
      if (cached) return [cached, true];
    }
    const webpage = await this._download_webpage(
      'https://pilot.wp.pl/tv/',
      undefined,
      'Downloading webpage',
    );
    const pageDataBaseUrl =
      this._search_regex(
        /<script src="(https:\/\/wp-pilot-gatsby\.wpcdn\.pl\/v[\d.-]+\/desktop)/,
        webpage,
        'gatsby build version',
      )! + '/page-data';
    const pageData = await this._download_json<{ staticQueryHashes: string[] }>(
      `${pageDataBaseUrl}/tv/page-data.json`,
      undefined,
      'Downloading page data',
    );
    for (const qhash of pageData.staticQueryHashes || []) {
      const qhashContent = await this._download_json<Record<string, unknown>>(
        `${pageDataBaseUrl}/sq/d/${qhash}.json`,
        undefined,
        'Searching for channel list',
      );
      const channelList = try_get(
        qhashContent,
        (x) =>
          ((x.data as Record<string, unknown>)?.allChannels as Record<string, unknown>)
            ?.nodes as ChannelNode[],
      );
      if (channelList == null) continue;
      channelListCache.set('channel-list', channelList);
      return [channelList, false];
    }
    throw new ExtractorError('Unable to find the channel list');
  }

  protected _parseChannel(chan: ChannelNode): VideoInfo {
    const thumbnails: Thumbnail[] = [];
    for (const key of ['thumbnail', 'thumbnail_mobile', 'icon'] as const) {
      const u = chan[key];
      if (typeof u === 'string' && u) thumbnails.push({ id: key, url: u });
    }
    return {
      id: String(chan.id),
      title: String(chan.name || chan.id),
      is_live: true,
      thumbnails,
    };
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('WPPilotBaseIE is not a standalone extractor', { expected: true });
  }
}

export class WPPilotIE extends WPPilotBaseIE {
  static IE_NAME = 'wppilot';
  static _VALID_URL = /(?:https?:\/\/pilot\.wp\.pl\/tv\/?#|wppilot:)(?<id>[a-z\d-]+)/;

  protected async _getChannel(idOrSlug: string): Promise<VideoInfo> {
    let [videoList, isCached] = await this._getChannelList(true);
    const key = /^\d+$/.test(idOrSlug) ? 'id' : 'slug';
    for (const video of videoList) {
      if (String(video[key]) === idOrSlug) return this._parseChannel(video);
    }
    if (isCached) {
      [videoList] = await this._getChannelList(false);
      for (const video of videoList) {
        if (String(video[key]) === idOrSlug) return this._parseChannel(video);
      }
    }
    throw new ExtractorError('Channel not found');
  }

  protected _isAuthorized(): boolean {
    const cookie = String(this.params.cookie || '');
    const m = /(?:^|;\s*)netviapisessid=([^;]+)/.exec(cookie);
    if (!m) return false;
    return !decodeURIComponent(m[1]!).startsWith('g:');
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    let videoId = this._match_id(url);
    const channel = await this._getChannel(videoId);
    videoId = String(channel.id);

    const endpoint = (
      this._isAuthorized() ? WPPilotBaseIE._VIDEO_URL : WPPilotBaseIE._VIDEO_GUEST_URL
    ).replace('%s', videoId);

    let video: Record<string, unknown>;
    try {
      video = await this._download_json<Record<string, unknown>>(endpoint, videoId, undefined, {
        query: { device_type: 'web' },
        headers: WPPilotBaseIE._HEADERS_WEB,
      });
    } catch (e) {
      // Upstream accepts HTTP 422 to recover stream_token; runtime has no expected_status.
      throw e;
    }

    const streamToken = try_get(
      video,
      (x) =>
        (
          ((x._meta as Record<string, unknown>)?.error as Record<string, unknown>)
            ?.info as Record<string, unknown>
        )?.stream_token,
    ) as string | undefined;

    if (streamToken) {
      const close = await this._download_json<Record<string, unknown>>(
        'https://pilot.wp.pl/api/v1/channels/close',
        videoId,
        'Invalidating previous stream session',
        {
          headers: WPPilotBaseIE._HEADERS_WEB,
          data: JSON.stringify({ channelId: videoId, t: streamToken }),
        },
      );
      if (try_get(close, (x) => (x.data as Record<string, unknown>)?.status) === 'ok') {
        return this.url_result(url, 'WPPilot');
      }
    }

    const formats = [];
    const streams =
      (
        (
          (video.data as Record<string, unknown>)?.stream_channel as Record<string, unknown>
        )?.streams as Array<Record<string, unknown>>
      ) || [];

    for (const fmt of streams) {
      if (fmt.type === 'hls@live:abr') {
        const urls = fmt.url as string[] | undefined;
        if (!urls?.length) continue;
        const pick = urls[Math.floor(Math.random() * urls.length)]!;
        formats.push(...(await this._extract_m3u8_formats(pick, videoId, 'mp4')));
      }
    }

    channel.formats = formats;
    return channel;
  }
}

export class WPPilotChannelsIE extends WPPilotBaseIE {
  static IE_NAME = 'wppilot:channels';
  static _VALID_URL = /(?:https?:\/\/pilot\.wp\.pl\/(?:tv\/?)?(?:\?[^#]*)?#?|wppilot:)$/;

  async _real_extract(_url: string): Promise<VideoInfo> {
    const [channelList] = await this._getChannelList();
    const entries: VideoInfo[] = channelList.map((chan) => {
      const entry = this._parseChannel(chan);
      return {
        ...entry,
        _type: 'url_transparent',
        url: `wppilot:${chan.id}`,
        ie_key: 'WPPilot',
      };
    });
    return this.playlist_result(entries, 'wppilot', 'WP Pilot');
  }
}
