// @ts-nocheck
/** WallaIE �?ported from yt-dlp walla.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { xmlChildText, xmlFindAll } from './_helpers';

const SUBTITLE_LANGS: Record<string, string> = {
  עברית: 'heb',
};

export class WallaIE extends InfoExtractor {
  static IE_NAME = 'Walla';
  static _WORKING = false;
  static _VALID_URL =
    /https?:\/\/vod\.walla\.co\.il\/[^/]+\/(?<id>\d+)\/(?<display_id>.+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const videoId = mobj.groups!.id!;
    const displayId = mobj.groups!.display_id!;

    const video = await this._download_webpage(
      `http://video2.walla.co.il/?w=null/null/${videoId}/@@/video/flv_pl`,
      displayId,
    );

    const itemMatch = video.match(/<items>\s*<item>([\s\S]*?)<\/item>/i);
    const item = itemMatch?.[1] || '';

    const title = xmlChildText(item, 'title');
    const description = xmlChildText(item, 'synopsis');
    const thumbnail = xmlChildText(item, 'preview_pic');
    const duration = int_or_none(xmlChildText(item, 'duration'));

    const subtitles: Record<string, Subtitle[]> = {};
    for (const subtitle of xmlFindAll(item.match(/<subtitles>([\s\S]*?)<\/subtitles>/i)?.[1] || '', 'subtitle')) {
      const lang = xmlChildText(subtitle, 'title');
      const src = xmlChildText(subtitle, 'src');
      if (!src) continue;
      const key = SUBTITLE_LANGS[lang || ''] || lang || 'und';
      if (!subtitles[key]) subtitles[key] = [];
      subtitles[key]!.push({ ext: 'srt', url: src });
    }

    const formats: Format[] = [];
    for (const quality of xmlFindAll(
      item.match(/<qualities>([\s\S]*?)<\/qualities>/i)?.[1] || '',
      'quality',
    )) {
      const formatId = xmlChildText(quality, 'title') || 'sd';
      const playPath = xmlChildText(quality, 'src');
      const fmt: Format = {
        url: 'rtmp://wafla.walla.co.il/vod',
        play_path: playPath || undefined,
        player_url: 'http://isc.walla.co.il/w9/swf/video_swf/vod/WallaMediaPlayerAvod.swf',
        page_url: url,
        ext: 'flv',
        format_id: formatId,
      };
      const hm = /^(?<height>\d+)[Pp]/.exec(formatId);
      if (hm?.groups?.height) fmt.height = Number(hm.groups.height);
      formats.push(fmt);
    }

    return {
      id: videoId,
      display_id: displayId,
      title: title || displayId,
      description: description || undefined,
      thumbnail: thumbnail || undefined,
      duration: duration ?? undefined,
      formats,
      subtitles,
    };
  }
}
