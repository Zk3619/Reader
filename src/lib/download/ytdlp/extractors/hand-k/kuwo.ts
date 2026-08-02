/**
 * KuwoBaseIE / KuwoIE / KuwoAlbumIE / KuwoChartIE / KuwoSingerIE / KuwoCategoryIE / KuwoMvIE
 * — ported from yt-dlp kuwo.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  get_element_by_id,
  remove_start,
} from '../../utils';
import { urljoin } from './_helpers';

type KuwoFormatSpec = {
  format: string;
  ext: string;
  preference: number;
  br?: string;
  abr?: number;
};

const KUWO_FORMATS: KuwoFormatSpec[] = [
  { format: 'ape', ext: 'ape', preference: 100 },
  { format: 'mp3-320', ext: 'mp3', br: '320kmp3', abr: 320, preference: 80 },
  { format: 'mp3-192', ext: 'mp3', br: '192kmp3', abr: 192, preference: 70 },
  { format: 'mp3-128', ext: 'mp3', br: '128kmp3', abr: 128, preference: 60 },
  { format: 'wma', ext: 'wma', preference: 20 },
  { format: 'aac', ext: 'aac', abr: 48, preference: 10 },
];

export class KuwoBaseIE extends InfoExtractor {
  static IE_NAME = 'kuwobase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('KuwoBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _getFormats(songId: string, tolerateIpDeny = false): Promise<Format[]> {
    const formats: Format[] = [];

    for (const fileFormat of KUWO_FORMATS) {
      const query: Record<string, string> = {
        format: fileFormat.ext,
        br: fileFormat.br || '',
        rid: `MUSIC_${songId}`,
        type: 'convert_url',
        response: 'url',
      };

      const songUrl = await this._download_webpage(
        'http://antiserver.kuwo.cn/anti.s',
        songId,
        `Download ${fileFormat.format} url info`,
        { query, headers: this.geo_verification_headers() },
      );

      if (songUrl === 'IPDeny' && !tolerateIpDeny) {
        throw new ExtractorError('This song is blocked in this region', { expected: true });
      }

      if (songUrl.startsWith('http://') || songUrl.startsWith('https://')) {
        formats.push({
          url: songUrl,
          format_id: fileFormat.format,
          quality: fileFormat.preference,
          abr: fileFormat.abr,
        });
      }
    }

    return formats;
  }
}

async function downloadWebpageWithUrl(
  ie: InfoExtractor,
  url: string,
  videoId: string,
  note?: string,
): Promise<{ webpage: string; finalUrl: string }> {
  const webpage = await ie._download_webpage(url, videoId, note);
  return { webpage, finalUrl: url };
}

export class KuwoIE extends KuwoBaseIE {
  static IE_NAME = 'kuwo:song';
  static IE_DESC = '酷我音乐';
  static _VALID_URL = /https?:\/\/(?:www\.)?kuwo\.cn\/yinyue\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const songId = this._match_id(url);
    const { webpage, finalUrl } = await downloadWebpageWithUrl(this, url, songId, 'Download song detail info');

    if (
      !finalUrl.includes(songId) ||
      webpage.includes('对不起，该歌曲由于版权问题已被下线，将返回网站首页')
    ) {
      throw new ExtractorError('this song has been offline because of copyright issues', { expected: true });
    }

    const songName = this._html_search_regex(/<p[^>]+id="lrcName">([^<]+)<\/p>/, webpage, 'song name') ?? songId;
    const singerName = remove_start(
      this._html_search_regex(
        /<a[^>]+href="http:\/\/www\.kuwo\.cn\/artist\/content\?name=([^"]+)">/,
        webpage,
        'singer name',
        null,
        false,
      ) || '',
      '歌手',
    ) || undefined;

    let lrcContent = clean_html(get_element_by_id('lrcContent', webpage) || '');
    if (lrcContent === '暂无') lrcContent = '';

    const formats = await this._getFormats(songId);

    const albumId = this._html_search_regex(
      /<a[^>]+href="http:\/\/www\.kuwo\.cn\/album\/(\d+)\/"/,
      webpage,
      'album id',
      null,
      false,
    );

    let publishTime: string | undefined;
    if (albumId) {
      const albumPage = await this._download_webpage(
        `http://www.kuwo.cn/album/${albumId}/`,
        songId,
        'Download album detail info',
        { fatal: false },
      );
      const pt = this._html_search_regex(/发行时间：(\d{4}-\d{2}-\d{2})/, albumPage, 'publish time', null, false);
      if (pt) publishTime = pt.replace(/-/g, '');
    }

    return {
      id: songId,
      title: songName,
      creator: singerName,
      upload_date: publishTime,
      description: lrcContent || undefined,
      formats,
    };
  }
}

export class KuwoAlbumIE extends InfoExtractor {
  static IE_NAME = 'kuwo:album';
  static IE_DESC = '酷我音乐 - 专辑';
  static _VALID_URL = /https?:\/\/(?:www\.)?kuwo\.cn\/album\/(?<id>\d+?)\//;

  async _real_extract(url: string): Promise<VideoInfo> {
    const albumId = this._match_id(url);
    const webpage = await this._download_webpage(url, albumId, 'Download album info');

    const albumName =
      this._html_search_regex(/<div[^>]+class="comm"[^<]+<h1[^>]+title="([^"]+)"/, webpage, 'album name') ??
      albumId;
    const albumIntro = remove_start(clean_html(get_element_by_id('intro', webpage) || ''), `${albumName}简介：`) || undefined;

    const songUrls = [...webpage.matchAll(/<p[^>]+class="listen"><a[^>]+href="(http:\/\/www\.kuwo\.cn\/yinyue\/\d+\/)"/g)].map(
      (m) => m[1]!,
    );
    const entries = songUrls.map((songUrl) => this.url_result(songUrl, 'Kuwo'));

    return this.playlist_result(entries, albumId, albumName, albumIntro);
  }
}

export class KuwoChartIE extends InfoExtractor {
  static IE_NAME = 'kuwo:chart';
  static IE_DESC = '酷我音乐 - 排行榜';
  static _VALID_URL = /https?:\/\/yinyue\.kuwo\.cn\/billboard_(?<id>[^.]+).htm/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const chartId = this._match_id(url);
    const webpage = await this._download_webpage(url, chartId, 'Download chart info');

    const entries = [...webpage.matchAll(/<a[^>]+href="(http:\/\/www\.kuwo\.cn\/yinyue\/\d+)/g)].map((m) =>
      this.url_result(m[1]!, 'Kuwo'),
    );

    return this.playlist_result(entries, chartId);
  }
}

export class KuwoSingerIE extends InfoExtractor {
  static IE_NAME = 'kuwo:singer';
  static IE_DESC = '酷我音乐 - 歌手';
  static _VALID_URL = /https?:\/\/(?:www\.)?kuwo\.cn\/mingxing\/(?<id>[^/]+)/;
  static PAGE_SIZE = 15;

  async _real_extract(url: string): Promise<VideoInfo> {
    const singerId = this._match_id(url);
    const webpage = await this._download_webpage(url, singerId, 'Download singer info');

    const singerName = this._html_search_regex(/<h1>([^<]+)<\/h1>/, webpage, 'singer name') ?? singerId;
    const artistId = this._html_search_regex(/data-artistid="(\d+)"/, webpage, 'artist id') ?? '';
    const pageCount = Number(this._html_search_regex(/data-page="(\d+)"/, webpage, 'page count') ?? '1');

    const entries: VideoInfo[] = [];
    for (let pageNum = 0; pageNum < pageCount; pageNum++) {
      const pageWebpage = await this._download_webpage(
        'http://www.kuwo.cn/artist/contentMusicsAjax',
        singerId,
        `Download song list page #${pageNum + 1}`,
        {
          query: { artistId, pn: String(pageNum), rn: String(KuwoSingerIE.PAGE_SIZE) },
        },
      );
      for (const m of pageWebpage.matchAll(/<div[^>]+class="name"><a[^>]+href="(\/yinyue\/\d+)/g)) {
        entries.push(this.url_result(urljoin(url, m[1]!), 'Kuwo'));
      }
    }

    return this.playlist_result(entries, singerId, singerName);
  }
}

export class KuwoCategoryIE extends InfoExtractor {
  static IE_NAME = 'kuwo:category';
  static IE_DESC = '酷我音乐 - 分类';
  static _VALID_URL = /https?:\/\/yinyue\.kuwo\.cn\/yy\/cinfo_(?<id>\d+?).htm/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const categoryId = this._match_id(url);
    const webpage = await this._download_webpage(url, categoryId, 'Download category info');

    const categoryName =
      this._html_search_regex(/<h1[^>]+title="([^<>]+?)">[^<>]+?<\/h1>/, webpage, 'category name') ?? categoryId;

    let categoryDesc = remove_start(get_element_by_id('intro', webpage)?.trim() || '', `${categoryName}简介：`) || undefined;
    if (categoryDesc === '暂无') categoryDesc = undefined;

    const jsonm = this._parse_json<{ musiclist?: Array<{ musicrid?: string }> }>(
      this._html_search_regex(/var\s+jsonm\s*=\s*([^;]+);/, webpage, 'category songs'),
      categoryId,
    )!;

    const entries = (jsonm.musiclist || []).map((song) =>
      this.url_result(`http://www.kuwo.cn/yinyue/${song.musicrid}/`, 'Kuwo'),
    );

    return this.playlist_result(entries, categoryId, categoryName, categoryDesc);
  }
}

const KUWO_MV_FORMATS: KuwoFormatSpec[] = [
  ...KUWO_FORMATS,
  { format: 'mkv', ext: 'mkv', preference: 250 },
  { format: 'mp4', ext: 'mp4', preference: 200 },
];

export class KuwoMvIE extends KuwoBaseIE {
  static IE_NAME = 'kuwo:mv';
  static IE_DESC = '酷我音乐 - MV';
  static _VALID_URL = /https?:\/\/(?:www\.)?kuwo\.cn\/mv\/(?<id>\d+?)\//;

  protected async _getFormats(songId: string, tolerateIpDeny = false): Promise<Format[]> {
    const formats: Format[] = [];

    for (const fileFormat of KUWO_MV_FORMATS) {
      const query: Record<string, string> = {
        format: fileFormat.ext,
        br: fileFormat.br || '',
        rid: `MUSIC_${songId}`,
        type: 'convert_url',
        response: 'url',
      };

      const songUrl = await this._download_webpage(
        'http://antiserver.kuwo.cn/anti.s',
        songId,
        `Download ${fileFormat.format} url info`,
        { query, headers: this.geo_verification_headers() },
      );

      if (songUrl === 'IPDeny' && !tolerateIpDeny) {
        throw new ExtractorError('This song is blocked in this region', { expected: true });
      }

      if (songUrl.startsWith('http://') || songUrl.startsWith('https://')) {
        formats.push({
          url: songUrl,
          format_id: fileFormat.format,
          quality: fileFormat.preference,
          abr: fileFormat.abr,
        });
      }
    }

    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const songId = this._match_id(url);
    const webpage = await this._download_webpage(url, songId, `Download mv detail info: ${songId}`);

    const mobj = webpage.match(
      /<h1[^>]+title="(?<song>[^"]+)">[^<]+<span[^>]+title="(?<singer>[^"]+)"/,
    );
    if (!mobj?.groups) {
      throw new ExtractorError('Unable to find song or singer names', { expected: true });
    }

    const formats = await this._getFormats(songId, true);
    const mvUrl = await this._download_webpage(
      `http://www.kuwo.cn/yy/st/mvurl?rid=MUSIC_${songId}`,
      songId,
      `Download ${songId} MV URL`,
    );
    formats.push({ url: mvUrl, format_id: 'mv' });

    return {
      id: songId,
      title: mobj.groups.song,
      creator: mobj.groups.singer,
      formats,
    };
  }
}
