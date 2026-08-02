/**
 * C56IE — ported from yt-dlp c56.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { js_to_json } from '../../utils';

export class C56IE extends InfoExtractor {
  static IE_NAME = '56.com';
  static _VALID_URL = /https?:\/\/(?:(?:www|player)\.)?56\.com\/(?:.+?\/)?(?:v_|(?:play_album.+-))(?<textid>.+?)\.(?:html|swf)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const textId = this._match_valid_url(url)!.groups!.textid!;

    const webpage = await this._download_webpage(url, textId);
    const sohuVideoInfoStr = this._search_regex(
      /var\s+sohuVideoInfo\s*=\s*(\{[^}]+\});/,
      webpage,
      'Sohu video info',
      null,
      false,
    );
    if (sohuVideoInfoStr) {
      const sohuVideoInfo = this._parse_json<{ url: string }>(sohuVideoInfoStr, textId, js_to_json);
      return this.url_result(sohuVideoInfo!.url, 'Sohu');
    }

    const page = await this._download_json<{
      info: {
        vid: string;
        Subject: string;
        duration: string | number;
        rfiles: Array<{ type: string; filesize: string | number; url: string }>;
        bimg?: string;
        img?: string;
      };
    }>(`http://vxml.56.com/json/${textId}/`, textId, 'Downloading video info');

    const info = page.info;

    const formats: Format[] = info.rfiles.map((f) => ({
      format_id: f.type,
      filesize: Number(f.filesize),
      url: f.url,
    }));

    return {
      id: info.vid,
      title: info.Subject,
      duration: Number(info.duration) / 1000.0,
      formats,
      thumbnail: info.bimg || info.img || undefined,
    };
  }
}
