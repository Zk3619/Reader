/** StreetVoiceIE — ported from yt-dlp streetvoice.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, try_get } from '../../utils';
import { parse_iso8601, strip_or_none, urljoin } from './_helpers';

export class StreetVoiceIE extends InfoExtractor {
  static IE_NAME = 'streetvoice';
  static _VALID_URL = /https?:\/\/(?:.+?\.)?streetvoice\.com\/[^/]+\/songs\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const songId = this._match_id(url);
    const baseUrl = `https://streetvoice.com/api/v4/song/${songId}/`;
    const song = await this._download_json<Record<string, unknown>>(baseUrl, songId, undefined, {
      query: {
        fields:
          'album,comments_count,created_at,id,image,length,likes_count,name,nickname,plays_count,profile,share_count,synopsis,user,username',
      },
    });
    const title = String(song.name || songId);
    const formats: Format[] = [];
    for (const [suffix, formatId] of [
      ['hls/file', 'hls'],
      ['file', 'http'],
      ['file/original', 'original'],
    ] as const) {
      const resp = await this._download_json<{ file?: string }>(
        baseUrl + suffix + '/',
        songId,
        `Downloading ${formatId} format URL`,
        { method: 'POST', data: '', fatal: false },
      );
      const fUrl = resp?.file;
      if (!fUrl) continue;
      const f: Format = { ext: 'mp3', format_id: formatId, url: fUrl, vcodec: 'none' };
      if (formatId === 'hls') f.protocol = 'm3u8_native';
      const abrMatch = /\.mp3\.(\d+)k/.exec(fUrl);
      if (abrMatch) {
        const abr = parseInt(abrMatch[1]!, 10);
        f.abr = abr;
        f.tbr = abr;
      }
      formats.push(f);
    }
    const user = (song.user || {}) as Record<string, unknown>;
    const username = user.username as string | undefined;
    const getCount = (x: string) => int_or_none(song[`${x}_count`]);
    return {
      id: songId,
      formats,
      title,
      description: strip_or_none(song.synopsis) || undefined,
      thumbnail: (song.image as string) || undefined,
      duration: int_or_none(song.length) ?? undefined,
      timestamp: parse_iso8601(song.created_at) ?? undefined,
      uploader: try_get(user, (x) => (x.profile as Record<string, unknown>)?.nickname) as string | undefined,
      uploader_id: str_or_none(user.id) || undefined,
      uploader_url: username ? urljoin(url, `/${username}/`) : undefined,
      view_count: getCount('plays') ?? undefined,
      like_count: getCount('likes') ?? undefined,
      comment_count: getCount('comments') ?? undefined,
      repost_count: getCount('share') ?? undefined,
      track: title,
      track_id: songId,
      album: try_get(song, (x) => (x.album as Record<string, unknown>)?.name) as string | undefined,
    };
  }
}
