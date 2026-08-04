// @ts-nocheck
/** WimTVIE â€?ported from yt-dlp wimtv.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, parse_duration } from '../../utils';
import { urlencodePostdata } from './_helpers';

const UUID_RE = '[\\da-f]{8}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{12}';

export class WimTVIE extends InfoExtractor {
  static IE_NAME = 'wimtv';
  static _VALID_URL = new RegExp(
    `https?://platform\\.wim\\.tv/(?:(?:embed/)?\\?|#/webtv/.+?/)(?<type>vod|live|cast)[=/](?<id>${UUID_RE}).*?`,
  );

  protected _player: Record<string, string> | null = null;

  async _real_initialize(): Promise<void> {
    if (!this._player) await this._getPlayerData();
  }

  protected async _getPlayerData(): Promise<void> {
    const msgId = 'Player data';
    this._player = {};

    const datas: Array<{
      url: string;
      vars: Array<{ regex: RegExp; variable: string }>;
    }> = [
      {
        url: 'https://platform.wim.tv/common/libs/player/wimtv/wim-rest.js',
        vars: [{ regex: /appAuth = "(.+?)"/, variable: 'app_auth' }],
      },
      {
        url: 'https://platform.wim.tv/common/config/endpointconfig.js',
        vars: [
          { regex: /PRODUCTION_HOSTNAME_THUMB = "(.+?)"/, variable: 'thumb_server' },
          {
            regex: /PRODUCTION_HOSTNAME_THUMB\s*\+\s*"(.+?)"/,
            variable: 'thumb_server_path',
          },
        ],
      },
    ];

    for (const data of datas) {
      const temp = await this._download_webpage(data.url, msgId);
      for (const v of data.vars) {
        const val = this._search_regex(v.regex, temp, msgId);
        if (!val) throw new ExtractorError(`${v.variable} not found`);
        this._player[v.variable] = val;
      }
    }
  }

  protected async _generateToken(): Promise<string> {
    const json = await this._download_json<Record<string, unknown>>(
      'https://platform.wim.tv/wimtv-server/oauth/token',
      'Token generation',
      undefined,
      {
        headers: { Authorization: `Basic ${this._player!.app_auth}` },
        data: urlencodePostdata({ grant_type: 'client_credentials' }),
      },
    );
    const token = json.access_token as string | undefined;
    if (!token) throw new ExtractorError('access token not generated');
    return token;
  }

  protected _generateThumbnail(thumbId: string | null | undefined, width = '720'): string | null {
    if (!thumbId || !this._player?.thumb_server) return null;
    if (!this._player.thumb_server_path) this._player.thumb_server_path = '';
    return `${this._player.thumb_server}${this._player.thumb_server_path}/asset/thumbnail/${thumbId}/${width}`;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._real_initialize();
    const urlc = this._match_valid_url(url)!.groups!;
    const videoId = urlc.id!;
    let streamType: string;
    let isLive: boolean;
    if (urlc.type === 'live' || urlc.type === 'cast') {
      streamType = `${urlc.type}/channel`;
      isLive = true;
    } else {
      streamType = 'vod';
      isLive = false;
    }

    const token = await this._generateToken();
    const json = await this._download_json<Record<string, unknown>>(
      `https://platform.wim.tv/wimtv-server/api/public/${streamType}/${videoId}/play`,
      videoId,
      undefined,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: '{}',
      },
    );

    const formats: Format[] = [];
    for (const src of (json.srcs as Array<Record<string, unknown>>) || []) {
      if (src.mimeType === 'application/x-mpegurl') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            String(src.uniqueStreamer || ''),
            videoId,
            'mp4',
          )),
        );
      }
      if (src.mimeType === 'video/flash') {
        const flashUrl = String(src.uniqueStreamer || '');
        formats.push({
          format_id: 'rtmp',
          url: flashUrl,
          ext: determine_ext(flashUrl, 'flv'),
          // rtmp_live not modeled on Format; is_live kept on info
        });
      }
    }

    const resource = (json.resource as Record<string, unknown>) || {};
    const thumb = this._generateThumbnail(resource.thumbnailId as string | undefined);

    return {
      id: videoId,
      title: String(resource.title || resource.name || videoId),
      duration: parse_duration(resource.duration) ?? undefined,
      formats,
      thumbnail: thumb || undefined,
      is_live: isLive,
    };
  }
}
