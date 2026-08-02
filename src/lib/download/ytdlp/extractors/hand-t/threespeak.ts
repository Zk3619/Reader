/** ThreeSpeakIE — ported from yt-dlp threespeak.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { try_get, unified_strdate } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class ThreeSpeakIE extends InfoExtractor {
  static _VALID_URL =
    /https?:\/\/(?:www\.)?3speak\.tv\/watch\?v=[^/]+\/(?<id>[^/$&#?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const jsonStr = this._html_search_regex(/JSON\.parse\('([^']+)'\)/, webpage, 'json');
    const dataJson = this._parse_json(
      this._parse_json(`"${jsonStr}"`, videoId) as string,
      videoId,
    ) as Record<string, unknown>;
    const videoJson = this._parse_json(String(dataJson.json_metadata), videoId) as Record<
      string,
      unknown
    >;

    const formats: VideoInfo['formats'] = [];
    let subtitles: VideoInfo['subtitles'] = {};

    const ogM3u8 = this._html_search_regex(
      /<meta\s?property="ogvideo"\s?content="([^"]+)">/,
      webpage,
      'og m3u8',
      null,
      false,
    );
    if (ogM3u8) {
      const httpsRes = await extractM3u8FormatsAndSubtitles(this, ogM3u8, videoId, 'https');
      formats?.push(...(httpsRes.formats || []));
      subtitles = mergeSubtitles(subtitles as Record<string, import('../../types').Subtitle[]>, httpsRes.subtitles);
    }

    const ipfsM3u8 = try_get(videoJson, (x) => (x as { video?: { info?: { ipfs?: string } } }).video?.info?.ipfs);
    if (ipfsM3u8) {
      const ipfsRes = await extractM3u8FormatsAndSubtitles(
        this,
        `https://ipfs.3speak.tv/ipfs/${ipfsM3u8}`,
        videoId,
        'ipfs',
      );
      formats?.push(...(ipfsRes.formats || []));
      subtitles = mergeSubtitles(subtitles as Record<string, import('../../types').Subtitle[]>, ipfsRes.subtitles);
    }

    const mp4File = try_get(videoJson, (x) => (x as { video?: { info?: { file?: string } } }).video?.info?.file);
    if (mp4File) {
      formats?.push({
        url: `https://threespeakvideo.b-cdn.net/${videoId}/${mp4File}`,
        ext: 'mp4',
        format_id: 'https-mp4',
        duration: try_get(videoJson, (x) => (x as { video?: { info?: { duration?: number } } }).video?.info?.duration) ?? undefined,
        filesize: try_get(videoJson, (x) => (x as { video?: { info?: { filesize?: number } } }).video?.info?.filesize) ?? undefined,
        quality: 11,
        format_note: 'Original file',
      });
    }

    return {
      id: videoId,
      title: String(dataJson.title || dataJson.root_title || videoId),
      uploader: dataJson.author ? String(dataJson.author) : undefined,
      description: try_get(videoJson, (x) => (x as { video?: { content?: { description?: string } } }).video?.content?.description) as string | undefined,
      tags: try_get(videoJson, (x) => (x as { video?: { content?: { tags?: string[] } } }).video?.content?.tags) as string[] | undefined,
      thumbnail: try_get(videoJson, (x) => (x as { image?: string[] }).image?.[0]) as string | undefined,
      upload_date: unified_strdate(dataJson.created) ?? undefined,
      formats,
      subtitles: subtitles && Object.keys(subtitles).length ? subtitles : undefined,
    };
  }
}

export class ThreeSpeakUserIE extends InfoExtractor {
  static _VALID_URL = /https?:\/\/(?:www\.)?3speak\.tv\/user\/(?<id>[^/$&?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const entries = [...webpage.matchAll(/data-payout\s?=\s?"([^"]+)"/g)]
      .map((m) => m[1])
      .filter(Boolean)
      .map((video) =>
        this.url_result(`https://3speak.tv/watch?v=${video}`, 'ThreeSpeak', video),
      );
    return this.playlist_result(entries, playlistId);
  }
}
