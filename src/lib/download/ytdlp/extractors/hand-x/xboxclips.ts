// @ts-nocheck
/** XboxClipsIE â€?ported from yt-dlp xboxclips.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, parse_filesize, parse_qs } from '../../utils';
import { parseHtml5MediaEntries } from './_helpers';

const MONTH_ABBREV: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

export class XboxClipsIE extends InfoExtractor {
  static IE_NAME = 'XboxClips';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:xboxclips\.com|gameclips\.io)\/(?:video\.php\?.*vid=|[^/]+\/)(?<id>[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    let pageUrl = url;
    if (url.includes('/video.php')) {
      const qs = parse_qs(url);
      pageUrl = `https://gameclips.io/${qs.gamertag?.[0]}/${qs.vid?.[0]}`;
    }

    const webpage = await this._download_webpage(pageUrl, videoId);
    const entries = await parseHtml5MediaEntries(this, pageUrl, webpage, videoId);
    const info = (entries[0] || { formats: [] }) as VideoInfo;

    const title = this._html_search_meta(['og:title', 'twitter:title'], webpage) || undefined;

    let uploadDate: string | undefined;
    const mobj = webpage.match(
      />Recorded: (\d{2})-(Jan|Feb|Mar|Apr|May|Ju[nl]|Aug|Sep|Oct|Nov|Dec)-(\d{4})/,
    );
    if (mobj) {
      const month = MONTH_ABBREV[mobj[2]!] ?? 0;
      uploadDate = `${mobj[3]}${String(month).padStart(2, '0')}${mobj[1]}`;
    }

    const filesize = parse_filesize(
      this._html_search_regex(/>Size: ([^<]+)</, webpage, 'file size', null, false),
    );
    const duration = int_or_none(
      this._html_search_regex(/>Duration: (\d+) Seconds</, webpage, 'duration', null, false),
    );
    const viewCount = int_or_none(
      this._html_search_regex(/>Views: (\d+)</, webpage, 'view count', null, false),
    );

    return {
      ...info,
      id: videoId,
      title: title || videoId,
      upload_date: uploadDate,
      filesize_approx: filesize ?? undefined,
      duration: duration ?? undefined,
      view_count: viewCount ?? undefined,
    };
  }
}
