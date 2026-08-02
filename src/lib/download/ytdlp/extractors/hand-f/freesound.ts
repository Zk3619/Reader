/**
 * FreesoundIE ??ported from yt-dlp freesound.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, get_element_by_class, get_element_by_id, unified_strdate } from '../../utils';

export class FreesoundIE extends InfoExtractor {
  static IE_NAME = 'freesound';
  static _VALID_URL = /https?:\/\/(?:www\.)?freesound\.org\/people\/[^/]+\/sounds\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const audioId = this._match_id(url);
    const webpage = await this._download_webpage(url, audioId);

    let audioUrl = this._og_search_property('audio', webpage, 'song url') || '';
    const title = this._og_search_property('audio:title', webpage, 'song title') || audioId;
    const description = this._html_search_regex(
      /id=["']sound_description["'][^>]*>([\s\S]+?)<\/div>/,
      webpage,
      'description',
      null,
      false,
    );

    const durationRaw = get_element_by_class('duration', webpage);
    const duration = float_or_none(durationRaw, 0.001) ?? undefined;
    const uploadDate = unified_strdate(get_element_by_id('sound_date', webpage)) ?? undefined;
    const uploader = this._og_search_property('audio:artist', webpage, 'uploader', false) ?? undefined;
    const channels = this._html_search_regex(/Channels<\/dt><dd>(.+?)<\/dd>/, webpage, 'channels info', null, false);

    const tagsStr = get_element_by_class('tags', webpage);
    const tags = tagsStr ? [...tagsStr.matchAll(/<a[^>]+>([^<]+)/g)].map((m) => m[1]!) : undefined;

    audioUrl = audioUrl.replace(/^https?:\/\/freesound\.org(https?:\/\/)/, '$1');
    const audioUrls = [audioUrl];
    if (audioUrl.includes('-lq.mp3')) audioUrls.push(audioUrl.replace('-lq.mp3', '-hq.mp3'));

    const formats: Format[] = audioUrls.map((formatUrl, quality) => ({
      url: formatUrl,
      format_id: quality === 0 ? 'hq' : 'lq',
      format_note: channels ?? undefined,
      quality,
    }));

    return {
      id: audioId,
      title,
      description: description ?? undefined,
      duration,
      uploader,
      upload_date: uploadDate,
      tags,
      formats,
    };
  }
}
