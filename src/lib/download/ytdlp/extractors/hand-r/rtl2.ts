/** RTL2IE — ported from yt-dlp rtl2.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class RTL2IE extends InfoExtractor {
  static IE_NAME = 'rtl2';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?rtl2\.de\/sendung\/[^/]+\/(?:video\/(?<vico_id>\d+)[^/]+\/(?<vivi_id>\d+)-|folge\/)(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let vicoId = m.groups?.vico_id;
    let viviId = m.groups?.vivi_id;
    const displayId = m.groups?.id || '';

    if (!vicoId) {
      const webpage = await this._download_webpage(url, displayId);
      const dataMatch = webpage.match(/data-collection="(?<vico_id>\d+)"[^>]+data-video="(?<vivi_id>\d+)"/);
      if (dataMatch?.groups) {
        vicoId = dataMatch.groups.vico_id;
        viviId = dataMatch.groups.vivi_id;
      } else {
        vicoId = this._html_search_regex(/vico_id\s*:\s*([0-9]+)/, webpage, 'vico_id') || undefined;
        viviId = this._html_search_regex(/vivi_id\s*:\s*([0-9]+)/, webpage, 'vivi_id') || undefined;
      }
    }

    const info = await this._download_json<{ video?: Record<string, unknown> }>(
      'https://service.rtl2.de/api-player-vipo/video.php',
      displayId,
      undefined,
      { query: { vico_id: vicoId!, vivi_id: viviId! } },
    );
    const videoInfo = info.video || {};
    const formats: Format[] = [];

    const rtmpUrl = videoInfo.streamurl as string | undefined;
    if (rtmpUrl) {
      const cleanRtmp = rtmpUrl.replace(/\\/g, '');
      const streamUrl = 'mp4:' + this._html_search_regex(/\/ondemand\/(.+)/, cleanRtmp, 'stream URL');
      formats.push({
        format_id: 'rtmp',
        url: cleanRtmp,
        play_path: streamUrl!,
        player_url: 'https://www.rtl2.de/sites/default/modules/rtl2/jwplayer/jwplayer-7.6.0/jwplayer.flash.swf',
        page_url: url,
        flash_version: 'LNX 11,2,202,429',
        rtmp_conn: ['S:connect', 'O:1', `NS:pageUrl:${url}`, 'NB:fpad:0', 'NN:videoFunction:1', 'O:0'],
        no_resume: true,
        quality: 1,
      });
    }

    const m3u8Url = videoInfo.streamurl_hls as string | undefined;
    if (m3u8Url) {
      formats.push(...(await extractM3u8FormatsAndSubtitles(this, m3u8Url, displayId, 'hls')).formats);
    }

    return {
      id: displayId,
      title: videoInfo.titel as string,
      thumbnail: videoInfo.image as string | undefined,
      description: videoInfo.beschreibung as string | undefined,
      duration: int_or_none(videoInfo.duration) ?? undefined,
      formats,
    };
  }
}
