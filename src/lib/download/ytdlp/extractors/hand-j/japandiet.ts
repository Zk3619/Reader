/**
 * SangiinIE / SangiinInstructionIE / ShugiinItv* — ported from yt-dlp japandiet.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  join_nonempty,
  parse_qs,
  smuggle_url,
  unsmuggle_url,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

const ERA_TABLE: Record<string, number> = {
  明治: 1868,
  大正: 1912,
  昭和: 1926,
  平成: 1989,
  令和: 2019,
};

function parseJapaneseDate(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const eraRe = Object.keys(ERA_TABLE).map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const normalized = text.replace(/[\s\u3000]+/g, '');
  const m = normalized.match(new RegExp(`(?:(${eraRe}))?(\\d+)年(\\d+)月(\\d+)日`));
  if (!m) return undefined;
  const [, era, yearStr, monthStr, dayStr] = m;
  let year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (era && ERA_TABLE[era]) year += ERA_TABLE[era];
  return `${String(year).padStart(4, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

function parseJapaneseDuration(text: string | null | undefined): number | undefined {
  const normalized = (text || '').replace(/[\s\u3000]+/g, '');
  const m = normalized.match(/(?:(\d+)日間?)?(?:(\d+)時間?)?(?:(\d+)分)?(?:(\d+)秒)?/);
  if (!m) return undefined;
  const days = int_or_none(m[1], 0) ?? 0;
  const hours = int_or_none(m[2], 0) ?? 0;
  const mins = int_or_none(m[3], 0) ?? 0;
  const secs = int_or_none(m[4], 0) ?? 0;
  return secs + mins * 60 + hours * 3600 + days * 86400;
}

export class ShugiinItvBaseIE extends InfoExtractor {
  static IE_NAME = 'shugiinitvbase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected static _INDEX_ROOMS: VideoInfo[] | null = null;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ShugiinItvBaseIE is not a standalone extractor', { expected: true });
  }

  protected static _findRooms(webpage: string): VideoInfo[] {
    const re =
      /<a\s+href="[^"]+\?room_id=(room\d+)"\s*class="play_live"[\s\S]*?class="s12_14">(.+?)<\/td>/gi;
    const entries: VideoInfo[] = [];
    for (const x of webpage.matchAll(re)) {
      const roomId = x[1]!;
      const title = clean_html(x[2])?.trim() || roomId;
      entries.push({
        _type: 'url',
        id: roomId,
        title,
        url: smuggle_url(`https://www.shugiintv.go.jp/jp/index.php?room_id=${roomId}`, { g: x.slice(1, 3) }),
        extractor: 'ShugiinItvLiveRoom',
        extractor_key: 'ShugiinItvLiveRoom',
      });
    }
    return entries;
  }

  protected async _fetchRooms(): Promise<VideoInfo[]> {
    if (!ShugiinItvBaseIE._INDEX_ROOMS) {
      const webpage = await this._download_webpage(
        'https://www.shugiintv.go.jp/jp/index.php',
        undefined,
        'Downloading proceedings info',
      );
      ShugiinItvBaseIE._INDEX_ROOMS = ShugiinItvBaseIE._findRooms(webpage);
    }
    return ShugiinItvBaseIE._INDEX_ROOMS;
  }
}

export class ShugiinItvLiveIE extends ShugiinItvBaseIE {
  static IE_NAME = 'shugiinitvlive';
  static IE_DESC = '衆議院インターネット審議中継';
  static _VALID_URL = /https?:\/\/(?:www\.)?shugiintv\.go\.jp\/(?:jp|en)(?:\/index\.php)?$/;

  static suitable(url: string): boolean {
    return (
      InfoExtractor.suitable.call(this, url) &&
      !ShugiinItvLiveRoomIE.suitable(url) &&
      !ShugiinItvVodIE.suitable(url)
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    void url;
    this.to_screen(
      'Downloading all running proceedings. To specify one proceeding, use direct link from the website',
    );
    return this.playlist_result(await this._fetchRooms(), undefined, 'All proceedings for today');
  }
}

export class ShugiinItvLiveRoomIE extends ShugiinItvBaseIE {
  static IE_NAME = 'shugiinitvliveroom';
  static IE_DESC = '衆議院インターネット審議中継 (中継)';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?shugiintv\.go\.jp\/(?:jp|en)\/index\.php\?room_id=(?<id>room\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const [realUrl, smug] = unsmuggle_url(url, {});
    let roomId: string;
    let title: string | undefined;

    const groups = smug.g as string[] | undefined;
    if (groups?.length) {
      roomId = groups[0]!;
      title = groups[1];
    } else {
      roomId = this._match_id(realUrl);
      const rooms = await this._fetchRooms();
      title = rooms.find((r) => r.id === roomId)?.title as string | undefined;
    }

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      `https://hlslive.shugiintv.go.jp/${roomId}/amlst:${roomId}/playlist.m3u8`,
      roomId,
      'hls',
    );

    return {
      id: roomId,
      title,
      formats,
      subtitles,
      is_live: true,
    };
  }
}

export class ShugiinItvVodIE extends ShugiinItvBaseIE {
  static IE_NAME = 'shugiinitvvod';
  static IE_DESC = '衆議院インターネット審議中継 (ビデオライブラリ)';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?shugiintv\.go\.jp\/(?:jp|en)\/index\.php\?ex=VL(?:&[^=]+=[^&]*)*&deli_id=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(
      `https://www.shugiintv.go.jp/jp/index.php?ex=VL&media_type=&deli_id=${videoId}`,
      videoId,
    );

    let m3u8Url = this._search_regex(/id="vtag_src_base_vod"\s*value="(http.+?\.m3u8)"/, webpage, 'm3u8 url')!;
    m3u8Url = m3u8Url.replace(/^http:\/\//, 'https://');

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');

    const title =
      this._html_search_regex(
        /<td\s+align="left">(.+)\s*\(\d+分\)/,
        webpage,
        'title',
        null,
        false,
      ) ||
      this._html_search_regex(
        /<TD.+?<IMG\s*src=".+?\/spacer\.gif".+?height="15">(.+?)<IMG/,
        webpage,
        'title',
        null,
        false,
      ) ||
      undefined;

    const releaseDate = parseJapaneseDate(
      this._html_search_regex(/開会日<\/td>\s*<td.+?\/td>\s*<TD>(.+?)<\/TD>/, webpage, 'release date', null, false),
    );

    const chapters: Array<{ title: string; start_time?: number; end_time?: number }> = [];
    for (const chp of webpage.matchAll(/<A\s+HREF="([^"]+?)"\s*class="play_vod">(?!<img)(.+)<\/[Aa]>/gi)) {
      const href = chp[1]!;
      const qs = parse_qs(href);
      const timeVal = qs.time?.[0]?.trim();
      chapters.push({
        title: clean_html(chp[2])?.trim() || '',
        start_time: timeVal != null ? Number(timeVal) : undefined,
      });
    }

    const trMatches = [...webpage.matchAll(/<TR\s*class="s14_24">([\s\S]*?)<\/TR>/gi)];
    const lastTr = trMatches.length ? trMatches[trMatches.length - 1]![1] : undefined;
    if (lastTr && chapters.length) {
      const tdMatches = [...lastTr.matchAll(/<TD.+?<\/TD>/gi)];
      const lastTd = tdMatches.length ? tdMatches[tdMatches.length - 1]![0] : undefined;
      if (lastTd) {
        const dur = parseJapaneseDuration(clean_html(lastTd));
        const last = chapters[chapters.length - 1]!;
        if (dur != null && last.start_time != null) {
          last.end_time = last.start_time + dur;
        }
      }
    }

    return {
      id: videoId,
      title,
      release_date: releaseDate,
      chapters,
      formats,
      subtitles,
    };
  }
}

export class SangiinInstructionIE extends InfoExtractor {
  static IE_NAME = 'sangiininstruction';
  static _VALID_URL = /https?:\/\/www\.webtv\.sangiin\.go\.jp\/webtv\/index\.php/;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError(
      'Copy the link from the button below the video description/player ' +
        'and use that link to download. If there is no button in the frame, ' +
        'get the URL of the frame showing the video.',
      { expected: true },
    );
  }
}

export class SangiinIE extends InfoExtractor {
  static IE_NAME = 'sangiin';
  static IE_DESC = '参議院インターネット審議中継 (archive)';
  static _VALID_URL = /https?:\/\/www\.webtv\.sangiin\.go\.jp\/webtv\/detail\.php\?sid=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const date = this._html_search_regex(
      /<dt[^>]*>\s*開会日\s*<\/dt>\s*<dd[^>]*>\s*(.+?)\s*<\/dd>/,
      webpage,
      'date',
      null,
      false,
    );
    const uploadDate = parseJapaneseDate(date);

    const meetingTitle = this._html_search_regex(
      /<dt[^>]*>\s*会議名\s*<\/dt>\s*<dd[^>]*>\s*(.+?)\s*<\/dd>/,
      webpage,
      'title',
      null,
      false,
    );

    const description = this._html_search_regex(
      /会議の経過\s*<\/h3>\s*<span[^>]*>(.+?)<\/span>/,
      webpage,
      'description',
      null,
      false,
    );

    const isLive = Boolean(
      this._html_search_regex(
        /<dt[^>]*>\s*公報掲載時刻\s*<\/dt>\s*<dd[^>]*>\s*(.+?)\s*<\/dd>/,
        webpage,
        'is_live',
        null,
        false,
      ),
    );

    const m3u8Url = this._search_regex(/var\s+videopath\s*=\s*(["'])(?<url>[^"']+)\1/, webpage, 'm3u8 url', null, true, 'url')!;
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');

    return {
      id: videoId,
      title: join_nonempty(date, meetingTitle) || videoId,
      description: description ?? undefined,
      upload_date: uploadDate,
      formats,
      subtitles,
      is_live: isLive,
    };
  }
}
