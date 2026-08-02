/**
 * FC2IE / FC2EmbedIE / FC2LiveIE ??ported from yt-dlp fc2.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { js_to_json, parse_qs, traverse_obj, update_url_query } from '../../utils';
import { urlencodePostdata, urljoin, UserNotLive } from './_helpers';

export class FC2IE extends InfoExtractor {
  static IE_NAME = 'fc2';
  static _VALID_URL = /(?:https?:\/\/video\.fc2\.com\/(?:[^/]+\/)*content\/|fc2:)(?<id>[^/]+)/;
  static _NETRC_MACHINE = 'fc2';

  protected async _login(): Promise<boolean> {
    const username = this.params.username as string | undefined;
    const password = this.params.password as string | undefined;
    if (!username || !password) return false;

    const loginData = urlencodePostdata({
      email: username,
      password,
      done: 'video',
      Submit: ' Login ',
    });
    const loginResults = (
      await this._request_webpage(
        {
          url: 'https://secure.id.fc2.com/index.php?mode=login&switch_language=en',
          data: loginData,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
        undefined,
        'Logging in',
      )
    )?.text || '';
    if (!loginResults.includes('mode=redirect&login=done')) {
      this.report_warning('unable to log in: bad username or password');
      return false;
    }
    await this._download_webpage(
      'http://id.fc2.com/?mode=redirect&login=done',
      undefined,
      'Login redirect',
      { fatal: false },
    );
    return true;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    await this._login();
    let webpage: string | null = null;
    if (!url.startsWith('fc2:')) {
      webpage = await this._download_webpage(url, videoId);
      await this._login();
    }

    let title: string | undefined;
    let thumbnail: string | undefined;
    let description: string | undefined;
    if (webpage) {
      title =
        this._search_regex(
          [
            /<h2\s+class="videoCnt_title">([^<]+?)<\/h2>/,
            /\s+href="[^"]+"\s*title="([^"]+?)"\s*rel="nofollow">\s*<img/,
            /\s+href="[^"]+"\s*title="([^"]+?)"\s*rel="nofollow">\s*\1/,
          ],
          webpage,
          'title',
          null,
          false,
        ) ?? undefined;
      thumbnail = this._og_search_thumbnail(webpage) ?? undefined;
      description = this._og_search_description(webpage) ?? undefined;
    }

    const vidplaylist = await this._download_json<{ playlist?: Record<string, unknown>; type?: number }>(
      `https://video.fc2.com/api/v3/videoplaylist/${videoId}?sh=1&fs=0`,
      videoId,
      'Downloading info page',
    );
    let vidUrl = traverse_obj(vidplaylist, ['playlist', 'nq']) as string | undefined;
    if (!vidUrl) throw new ExtractorError('Unable to extract video URL');
    vidUrl = urljoin('https://video.fc2.com/', vidUrl);

    return {
      id: videoId,
      title,
      url: vidUrl,
      ext: 'mp4',
      protocol: vidplaylist.type === 2 ? 'm3u8_native' : 'https',
      description,
      thumbnail,
    };
  }
}

export class FC2EmbedIE extends InfoExtractor {
  static IE_NAME = 'fc2:embed';
  static _VALID_URL = /https?:\/\/video\.fc2\.com\/flv2\.swf\?(?<query>.+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const queryStr = this._match_valid_url(url)!.groups!.query!;
    const query = parse_qs(`?${queryStr}`);
    const videoId = query.i?.[query.i.length - 1] || '';
    const title = query.tl?.[0] || `FC2 video ${videoId}`;
    const sj = query.sj?.[0];
    let thumbnail: string | undefined;
    if (sj) {
      thumbnail = `http://video${sj}-thumbnail.fc2.com/up/pic/${videoId.slice(0, 6)}/${videoId.slice(6, 8)}/${videoId.slice(-2)}/${videoId.slice(-1)}/${videoId}.jpg`;
    }

    return {
      _type: 'url_transparent',
      ie_key: 'FC2',
      id: videoId,
      url: `fc2:${videoId}`,
      title,
      thumbnail,
    };
  }
}

export class FC2LiveIE extends InfoExtractor {
  static IE_NAME = 'fc2:live';
  static _VALID_URL = /https?:\/\/live\.fc2\.com\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const pageUrl = `https://live.fc2.com/${videoId}/`;
    const webpage = await this._download_webpage(pageUrl, videoId);

    const memberApi = await this._download_json<{ data?: Record<string, unknown> }>(
      'https://live.fc2.com/api/memberApi.php',
      videoId,
      'Requesting member info',
      {
        data: urlencodePostdata({
          channel: '1',
          profile: '1',
          user: '1',
          streamid: videoId,
        }),
        method: 'POST',
      },
    );

    const channelData = (memberApi.data?.channel_data as Record<string, unknown>) || {};
    const controlServer = await this._download_json<Record<string, unknown>>(
      'https://live.fc2.com/api/getControlServer.php',
      videoId,
      'Downloading ControlServer data',
      {
        data: urlencodePostdata({
          channel_id: videoId,
          mode: 'play',
          orz: '',
          channel_version: String(channelData.version ?? ''),
          client_version: '2.1.0\n [1]',
          client_type: 'pc',
          client_app: 'browser_hls',
          ipv6: '',
        }),
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      },
    );

    if (traverse_obj(controlServer, ['status', Number]) && !('control_token' in controlServer)) {
      throw new UserNotLive(videoId);
    }

    const wsUrl = update_url_query(String(controlServer.url ?? ''), {
      control_token: String(controlServer.control_token ?? ''),
    });

    // Pragmatic: fetch playlist URL from control server JSON when present
    const playlistArg = controlServer.arguments as Record<string, unknown> | undefined;
    const formats: Format[] = [];
    if (playlistArg && typeof playlistArg === 'object') {
      for (const [name, playlists] of Object.entries(playlistArg)) {
        if (!Array.isArray(playlists)) continue;
        for (const pl of playlists) {
          if (!pl || typeof pl !== 'object') continue;
          const rec = pl as Record<string, unknown>;
          const master = rec.url;
          if (rec.status === 0 && typeof master === 'string' && master.includes('master_playlist')) {
            formats.push(
              ...(await this._extract_m3u8_formats(master, videoId, 'mp4', 'm3u8_native', undefined, undefined, name, undefined, false)),
            );
          }
        }
      }
    }

    if (!formats.length && wsUrl) {
      this.report_warning('FC2 live WebSocket path not fully supported; attempting HLS from control server');
    }

    let title =
      this._html_search_meta('og:title', webpage, undefined, false) ||
      this._html_search_meta('twitter:title', webpage, undefined, false) ||
      undefined;
    if (title) title = title.replace(/\s+-\s+.+$/, '');
    let uploader: string | undefined;
    const titleMatch = title?.match(/^(.+?)\s*\[(.+?)\]$/);
    if (titleMatch) {
      title = titleMatch[1];
      uploader = titleMatch[2];
    }

    let liveInfoView: Record<string, unknown> | undefined;
    const liveInfoRaw = this._search_regex(
      /liveInfoView\s*:\s*({[\s\S]+?}),\s*premiumStateView/s,
      webpage,
      'user info',
      null,
      false,
    );
    if (liveInfoRaw) {
      const sanitized = liveInfoRaw.replace(/\$\(.+?\)[^,]+,/g, '"",');
      liveInfoView = this._parse_json<Record<string, unknown>>(js_to_json(sanitized), videoId) || undefined;
    }

    return {
      id: videoId,
      title: title || (liveInfoView?.title as string | undefined) || videoId,
      description:
        this._html_search_meta('og:description', webpage, undefined, false) ||
        this._html_search_meta('twitter:description', webpage, undefined, false) ||
        (liveInfoView?.info as string | undefined),
      formats,
      uploader: uploader || (liveInfoView?.name as string | undefined),
      uploader_id: videoId,
      thumbnail: liveInfoView?.thumb as string | undefined,
      is_live: true,
    };
  }
}
