// @ts-nocheck
/** WebOfStoriesIE / WebOfStoriesPlaylistIE â€?ported from yt-dlp webofstories.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { orderedSet } from './_helpers';

export class WebOfStoriesIE extends InfoExtractor {
  static IE_NAME = 'WebOfStories';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?webofstories\.com\/play\/(?:[^/]+\/)?(?<id>[0-9]+)/;
  static _VIDEO_DOMAIN = 'http://eu-mobile.webofstories.com/';
  static _GREAT_LIFE_STREAMER = 'rtmp://eu-cdn1.webofstories.com/cfx/st/';
  static _USER_STREAMER = 'rtmp://eu-users.webofstories.com/cfx/st/';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const title =
      this._og_search_title(webpage, false) ||
      this._html_search_regex(
        /<strong>Title:\s*<\/strong>([\s\S]+?)</,
        webpage,
        'title',
      ) ||
      videoId;
    const description = this._html_search_meta('description', webpage) || undefined;
    const thumbnail = this._og_search_thumbnail(webpage) || undefined;

    const embedParamsRaw = this._search_regex(
      /\$\("#embedCode"\)\.html\(getEmbedCode\(([\s\S]*?)\)/,
      webpage,
      'embed params',
    )!;
    const embedParams = embedParamsRaw.split(',').map((s) => s.trim().replace(/^[\s\r\n\t']+|[\s\r\n\t']+$/g, ''));

    const speakerId = embedParams[1] || '';
    const storyId = embedParams[2] || videoId;
    const storyDuration = embedParams[3];
    const speakerType = embedParams[4] || '';
    const greatLife = embedParams[5] || '';
    const storyFilename = embedParams[8] || '';

    const isGreatLifeSeries = greatLife === 'true';
    const duration = int_or_none(storyDuration);

    let msPrefix = '';
    if (speakerType.toLowerCase() === 'ms') {
      msPrefix = 'mini_sites/';
    }

    let mp4Url: string;
    let rtmpExt: string;
    let streamer: string;
    let playPath: string;

    if (isGreatLifeSeries) {
      mp4Url = `${WebOfStoriesIE._VIDEO_DOMAIN}lives/${speakerId}/${storyFilename}.mp4`;
      rtmpExt = 'flv';
      streamer = WebOfStoriesIE._GREAT_LIFE_STREAMER;
      playPath = `stories/${speakerId}/${storyFilename}`;
    } else {
      mp4Url = `${WebOfStoriesIE._VIDEO_DOMAIN}${msPrefix}${speakerId}/${storyFilename}.mp4`;
      rtmpExt = 'mp4';
      streamer = WebOfStoriesIE._USER_STREAMER;
      playPath = `mp4:${msPrefix}${speakerId}/${storyFilename}.mp4`;
    }

    const formats: Format[] = [
      { format_id: 'mp4_sd', url: mp4Url },
      {
        format_id: 'rtmp_sd',
        page_url: url,
        url: streamer,
        ext: rtmpExt,
        play_path: playPath,
      },
    ];

    return {
      id: storyId,
      title,
      formats,
      thumbnail,
      description,
      duration: duration ?? undefined,
    };
  }
}

export class WebOfStoriesPlaylistIE extends InfoExtractor {
  static IE_NAME = 'WebOfStories:playlist';
  static _VALID_URL = /https?:\/\/(?:www\.)?webofstories\.com\/playAll\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);

    const entries = orderedSet(
      [...webpage.matchAll(/\bid=["']td_(\d+)/g)].map((m) => m[1]!),
    ).map((videoId) =>
      this.url_result(`http://www.webofstories.com/play/${videoId}`, 'WebOfStories', videoId),
    );

    let title =
      this._search_regex(
        /<div id="speakerName">\s*<span>([^<]+)<\/span>/,
        webpage,
        'speaker',
        null,
        false,
      ) || null;
    if (title) {
      const field = this._search_regex(
        /<span id="primaryField">([^<]+)<\/span>/,
        webpage,
        'field',
        null,
        false,
      );
      if (field) title += ` (${field})`;
    }

    if (!title) {
      title =
        this._search_regex(
          /<title>Play\s+all\s+stories\s*-\s*([^<]+)\s*-\s*Web\s+of\s+Stories<\/title>/,
          webpage,
          'title',
        ) || playlistId;
    }

    return this.playlist_result(entries, playlistId, title);
  }
}
