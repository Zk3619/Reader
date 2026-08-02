/**
 * AsobiStageIE — aligned with yt-dlp asobistage.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none, traverse_obj, url_or_none } from '../../utils';

export class AsobiStageIE extends InfoExtractor {
  static IE_NAME = 'asobistage';
  static IE_DESC = 'ASOBISTAGE (アソビステージ)';
  static _VALID_URL =
    /https?:\/\/asobistage\.asobistore\.jp\/event\/(?<id>(?<event>\w+)\/(?<type>archive|player)\/(?<slug>\w+))(?:[?#]|$)/;

  private static API_HOST = 'https://asobistage-api.asobistore.jp';
  private headers: Record<string, string> = {};

  async _real_extract(url: string): Promise<VideoInfo> {
    const matchId = this._match_id(url);
    const webpage = await this._download_webpage(url, matchId);
    const pageUrl = url;
    const m = this._match_valid_url(pageUrl)!;
    const videoId = m.groups?.id ?? matchId;
    const event = m.groups?.event ?? '';
    const type = m.groups?.type ?? '';
    const slug = m.groups?.slug ?? '';
    const videoType = type === 'archive' ? 'archives' : 'broadcasts';

    const token = await this._download_json<string>(
      `${AsobiStageIE.API_HOST}/api/v1/vspf/token`,
      undefined,
      'Getting token',
    );
    this.headers = { Authorization: `Bearer ${token}` };

    const nextData = this._search_json<Record<string, unknown>>(
      /<script id="__NEXT_DATA__"[^>]*>/,
      webpage,
      '__NEXT_DATA__',
      videoId,
      { fatal: false },
    );
    const eventData = {
      title: str_or_none(traverse_obj(nextData, ['props', 'pageProps', 'eventCMSData', 'event_name'])) || videoId,
      thumbnail: url_or_none(traverse_obj(nextData, ['props', 'pageProps', 'eventCMSData', 'event_thumbnail_image'])) || undefined,
    };

    const channelList = await this._download_json<Record<string, unknown>>(
      `https://asobistage.asobistore.jp/cdn/v101/events/${event}/${videoType}.json`,
      videoId,
      'Getting channel list',
    );
    const list = (channelList[videoType] as Record<string, unknown>[]) || [];
    const available = list.filter(
      (v) => v.broadcast_slug === slug && v.channels && (v.channels as Record<string, unknown>[]).some(
        (c) => c.chennel_vspf_id && c.chennel_vspf_id !== '00000',
      ),
    );

    const entries: VideoInfo[] = [];
    for (const block of available) {
      for (const channel of (block.channels as Record<string, unknown>[]) || []) {
        const channelId = str_or_none(channel.chennel_vspf_id);
        if (!channelId || channelId === '00000') continue;
        const rights = (channel.viewrights as Record<string, unknown>[]) || [];
        const open = rights.some((r) => r.rights_type_id === 6);
        if (!open) {
          this.report_warning(`You are not a ticketholder for "${channel.channel_name || channelId}"`);
          continue;
        }

        let m3u8Url: string | undefined;
        let title: string | undefined;
        let thumbnail: string | undefined;
        if (videoType === 'archives') {
          const channelJson = await this._download_json<Record<string, unknown>>(
            `https://survapi.channel.or.jp/proxy/v1/contents/${channelId}/get_by_cuid`,
            channelId,
            'Getting archive channel info',
            { headers: this.headers, fatal: false },
          );
          m3u8Url = str_or_none(traverse_obj(channelJson, ['ex_content', 'streaming_url'])) || undefined;
          title = str_or_none(traverse_obj(channelJson, ['ex_content', 'title'])) || undefined;
          thumbnail = url_or_none(traverse_obj(channelJson, ['ex_content', 'thumbnail', 'url'])) || undefined;
        } else {
          const channelJson = await this._download_json<Record<string, unknown>>(
            `https://survapi.channel.or.jp/ex/events/${channelId}`,
            channelId,
            'Getting live channel info',
            { headers: this.headers, query: { embed: 'channel' }, fatal: false },
          );
          m3u8Url = str_or_none(traverse_obj(channelJson, ['data', 'Channel', 'Custom_live_url'])) || undefined;
          title = str_or_none(traverse_obj(channelJson, ['data', 'Name'])) || undefined;
          thumbnail = url_or_none(traverse_obj(channelJson, ['data', 'Poster_url'])) || undefined;
        }

        entries.push({
          id: channelId,
          title: title || channelId,
          formats: m3u8Url
            ? await this._extract_m3u8_formats(m3u8Url, channelId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)
            : [],
          is_live: videoType === 'broadcasts',
          thumbnail,
        });
      }
    }

    if (!entries.length) this.raise_login_required();
    return this.playlist_result(entries, videoId, eventData.title);
  }
}
