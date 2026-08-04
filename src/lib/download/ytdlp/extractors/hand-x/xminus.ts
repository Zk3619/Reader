// @ts-nocheck
/** XMinusIE �?ported from yt-dlp xminus.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, parse_duration } from '../../utils';

export class XMinusIE extends InfoExtractor {
  static IE_NAME = 'XMinus';
  static _WORKING = false;
  static _VALID_URL = /https?:\/\/(?:www\.)?x-minus\.org\/track\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const artist = this._html_search_regex(
      /<a[^>]+href="\/artist\/\d+">([^<]+)<\/a>/,
      webpage,
      'artist',
    )!;
    const trackTitle = this._html_search_regex(
      /<span[^>]+class="minustrack-full-title(?:\s+[^"]+)?"[^>]*>([^<]+)/,
      webpage,
      'title',
    )!;
    const title = `${artist}-${trackTitle}`;

    const duration = parse_duration(
      this._html_search_regex(
        /<span[^>]+class="player-duration(?:\s+[^"]+)?"[^>]*>([^<]+)/,
        webpage,
        'duration',
        null,
        false,
      ),
    );

    let tbr: number | undefined;
    let filesizeApprox: number | undefined;
    const mobj = webpage.match(
      /<div[^>]+class="dw-info(?:\s+[^"]+)?"[^>]*>(?<tbr>\d+)\s*кбит\/c\s+(?<filesize>[0-9.]+)\s*мб<\/div>/,
    );
    if (mobj?.groups) {
      filesizeApprox = parseFloat(mobj.groups.filesize!) * 1_000_000;
      tbr = parseFloat(mobj.groups.tbr!);
    }

    const viewCount = int_or_none(
      this._html_search_regex(
        /<span><[^>]+class="icon-chart-bar".*?>(\d+)<\/span>/,
        webpage,
        'view count',
        null,
        false,
      ),
    );

    let description = this._html_search_regex(
      /<pre[^>]+id="lyrics-original"[^>]*>([\s\S]*?)<\/pre>/,
      webpage,
      'song lyrics',
      null,
      false,
    );
    if (description) {
      description = description.replace(/ *\r */g, '\n');
    }

    const k = this._search_regex(
      /<div[^>]+id="player-bottom"[^>]+data-k="([^"]+)">/,
      webpage,
      'encoded data',
    )!;
    const h = Date.now() / 1000 / 3600;
    let a = 0;
    for (const c of k) a += c.charCodeAt(0);
    a += parseInt(videoId, 10) + h;
    const videoUrl = `http://x-minus.me/dl/minus?id=${videoId}&tkn2=${Math.trunc(a)}f${Math.trunc(h)}`;

    return {
      id: videoId,
      title,
      url: videoUrl,
      ext: 'mp3',
      duration: duration ?? undefined,
      filesize_approx: filesizeApprox,
      tbr,
      view_count: viewCount ?? undefined,
      description: description || undefined,
    };
  }
}
