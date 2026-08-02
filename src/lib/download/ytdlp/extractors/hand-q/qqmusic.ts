/** QQMusic* IEs — ported from yt-dlp qqmusic.py (singer pagination simplified to fetch-all) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  js_to_json,
  join_nonempty,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';

function stripJsonp(text: string): string {
  const m = text.match(/^[^(]+\(([\s\S]+)\);?\s*$/);
  return m?.[1] ?? text;
}

const QQ_FORMATS: Record<string, { name: string; prefix: string; ext: string; preference: number; abr?: number }> = {
  F000: { name: 'flac', prefix: 'F000', ext: 'flac', preference: 60 },
  A000: { name: 'ape', prefix: 'A000', ext: 'ape', preference: 50 },
  M800: { name: '320mp3', prefix: 'M800', ext: 'mp3', preference: 40, abr: 320 },
  M500: { name: '128mp3', prefix: 'M500', ext: 'mp3', preference: 30, abr: 128 },
  C400: { name: '96aac', prefix: 'C400', ext: 'm4a', preference: 20, abr: 96 },
  C200: { name: '48aac', prefix: 'C200', ext: 'm4a', preference: 20, abr: 48 },
};

export class QQMusicBaseIE extends InfoExtractor {
  static IE_NAME = 'qqmusicbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('QQMusicBaseIE is not a standalone extractor', { expected: true });
  }

  protected _getCookie(key: string): string | undefined {
    return this._get_cookies('https://y.qq.com')[key];
  }

  protected _getUin(): number {
    return int_or_none(this._getCookie('uin')) || 0;
  }

  protected get isLoggedIn(): boolean {
    return Boolean(this._getUin() && this._getCookie('fqm_pvqid'));
  }

  protected static _mRGetRuin(): number {
    const curMs = Math.floor(Date.now()) % 1000;
    return Math.round(Math.random() * 2147483647 * curMs) % 1e10;
  }

  protected async _downloadInitData(url: string, mid: string, fatal = true): Promise<Record<string, unknown>> {
    const webpage = await this._download_webpage(url, mid, undefined, { fatal });
    return (
      this._search_json<Record<string, unknown>>(/window\.__INITIAL_DATA__\s*=/, webpage || '', 'init data', mid, {
        transform_source: js_to_json,
        fatal,
        default: {},
      }) || {}
    );
  }

  protected async _makeFcuReq(reqDict: Record<string, unknown>, mid: string, opts?: { note?: string; headers?: Record<string, string> }) {
    return this._download_json<Record<string, unknown>>(
      'https://u.y.qq.com/cgi-bin/musicu.fcg',
      mid,
      opts?.note,
      {
        method: 'POST',
        data: JSON.stringify({
          comm: { cv: 0, ct: 24, format: 'json', uin: this._getUin() },
          ...reqDict,
        }),
        headers: opts?.headers,
      },
    );
  }
}

export class QQMusicIE extends QQMusicBaseIE {
  static IE_NAME = 'qqmusic';
  static IE_DESC = 'QQ音乐';
  static _VALID_URL = /https?:\/\/y\.qq\.com\/n\/ryqq\/songDetail\/(?<id>[0-9A-Za-z]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mid = this._match_id(url);
    const initData = await this._downloadInitData(url, mid, false);
    const infoResp = await this._makeFcuReq(
      {
        info: {
          module: 'music.pf_song_detail_svr',
          method: 'get_song_detail_yqq',
          param: { song_mid: mid, song_type: 0 },
        },
      },
      mid,
      { note: 'Downloading song info' },
    );
    const infoData = traverse_obj(infoResp, ['info', 'data', 'track_info']) as Record<string, unknown>;
    const mediaMid = traverse_obj(infoData, ['file', 'media_mid']) as string;

    const data = await this._makeFcuReq(
      {
        req_1: {
          module: 'vkey.GetVkeyServer',
          method: 'CgiGetVkey',
          param: {
            guid: String(QQMusicBaseIE._mRGetRuin()),
            songmid: Object.keys(QQ_FORMATS).map(() => mid),
            songtype: Object.keys(QQ_FORMATS).map(() => 0),
            uin: String(this._getUin()),
            loginflag: 1,
            platform: '20',
            filename: Object.values(QQ_FORMATS).map((f) => `${f.prefix}${mediaMid}.${f.ext}`),
          },
        },
        req_2: {
          module: 'music.musichallSong.PlayLyricInfo',
          method: 'GetPlayLyricInfo',
          param: { songMID: mid },
        },
      },
      mid,
      { note: 'Downloading formats and lyric', headers: this.geo_verification_headers() },
    );

    if (traverse_obj(data, ['req_1', 'code']) !== 0) {
      throw new ExtractorError(`Failed to download format info, error code ${traverse_obj(data, ['req_1', 'code']) || 'unknown'}`);
    }

    const formats: Format[] = [];
    for (const mediaInfo of traverse_obj(data, ['req_1', 'data', 'midurlinfo']) as Array<Record<string, unknown>>) {
      if (mediaInfo.songmid !== mid || !mediaInfo.purl) continue;
      const filename = String(mediaInfo.filename ?? '');
      const formatKey = filename.slice(0, 4);
      const formatInfo = QQ_FORMATS[formatKey] || {};
      const formatId = formatInfo.name;
      formats.push({
        url: `https://dl.stream.qqmusic.qq.com${mediaInfo.purl}`,
        format_id: formatId,
        filesize: int_or_none(traverse_obj(infoData, ['file', `size_${formatId}`])) ?? undefined,
        quality: formatInfo.preference,
        abr: formatInfo.abr,
        ext: formatInfo.ext,
        vcodec: 'none',
      });
    }

    if (!formats.length && !this.isLoggedIn) this.raise_login_required();

    let lrcContent: string | undefined;
    if (!traverse_obj(data, ['req_2', 'code'])) {
      const lyricB64 = traverse_obj(data, ['req_2', 'data', 'lyric']) as string | undefined;
      if (lyricB64) {
        try {
          lrcContent = atob(lyricB64);
        } catch {
          /* ignore */
        }
      }
    }

    const info: VideoInfo = {
      id: mid,
      formats,
      title: str_or_none(infoData.title) ?? undefined,
      album: traverse_obj(infoData, ['album', 'title']) as string | undefined,
      release_date: str_or_none(infoData.time_public)?.replace(/-/g, '') ?? undefined,
      creators: ((infoData.singer as Array<{ name?: string }>) || []).map((s) => s.name).filter(Boolean) as string[],
      alt_title: str_or_none(infoData.subtitle) ?? undefined,
      duration: int_or_none(infoData.interval) ?? undefined,
      thumbnail: url_or_none(traverse_obj(initData, ['detail', 'picurl'])) ?? undefined,
      description: undefined,
      genres: undefined,
    };
    if (lrcContent) {
      info.subtitles = { origin: [{ ext: 'lrc', data: lrcContent }] };
      info.description = join_nonempty(info.description, lrcContent, '\n');
    }
    return info;
  }
}

export class QQMusicSingerIE extends QQMusicBaseIE {
  static IE_NAME = 'qqmusic:singer';
  static IE_DESC = 'QQ音乐 - 歌手';
  static _VALID_URL = /https?:\/\/y\.qq\.com\/n\/ryqq\/singer\/(?<id>[0-9A-Za-z]+)/;
  static _PAGE_SIZE = 50;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mid = this._match_id(url);
    const initData = await this._downloadInitData(url, mid, false);
    const entries: VideoInfo[] = [];

    for (let pageNum = 0; ; pageNum++) {
      const data = await this._makeFcuReq(
        {
          req_1: {
            module: 'music.web_singer_info_svr',
            method: 'get_singer_detail_info',
            param: { sort: 5, singermid: mid, sin: pageNum * QQMusicSingerIE._PAGE_SIZE, num: QQMusicSingerIE._PAGE_SIZE },
          },
        },
        mid,
        { note: `Downloading page ${pageNum}` },
      );
      const songlist = traverse_obj(data, ['req_1', 'data', 'songlist']) as Array<Record<string, unknown>> | undefined;
      if (!songlist?.length) break;
      for (const song of songlist) {
        const songMid = str_or_none(song.mid);
        if (!songMid) continue;
        entries.push(this.url_result(`https://y.qq.com/n/ryqq/songDetail/${songMid}`, 'QQMusic', songMid, str_or_none(song.title) ?? undefined));
      }
      if (songlist.length < QQMusicSingerIE._PAGE_SIZE) break;
    }

    return this.playlist_result(
      entries,
      mid,
      traverse_obj(initData, ['singerDetail', 'basic_info', 'name']) as string | undefined,
      traverse_obj(initData, ['singerDetail', 'ex_info', 'desc']) as string | undefined,
    );
  }
}

export class QQPlaylistBaseIE extends InfoExtractor {
  static IE_NAME = 'qqplaylistbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('QQPlaylistBaseIE is not a standalone extractor', { expected: true });
  }

  protected *_extractEntries(infoJson: Record<string, unknown>, path: string[]): Generator<VideoInfo> {
    let cur: unknown = infoJson;
    for (const key of path) {
      if (key === '...') {
        if (!Array.isArray(cur)) return;
        for (const song of cur) {
          if (!song || typeof song !== 'object') continue;
          const songMid = (song as Record<string, unknown>).songmid;
          if (!songMid) continue;
          yield this.url_result(
            `https://y.qq.com/n/ryqq/songDetail/${songMid}`,
            'QQMusic',
            String(songMid),
            str_or_none((song as Record<string, unknown>).songname) ?? undefined,
          );
        }
        return;
      }
      cur = (cur as Record<string, unknown>)?.[key];
    }
  }
}

export class QQMusicAlbumIE extends QQPlaylistBaseIE {
  static IE_NAME = 'qqmusic:album';
  static IE_DESC = 'QQ音乐 - 专辑';
  static _VALID_URL = /https?:\/\/y\.qq\.com\/n\/ryqq\/albumDetail\/(?<id>[0-9A-Za-z]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mid = this._match_id(url);
    const albumJson = (
      await this._download_json<{ data?: Record<string, unknown> }>(
        'http://i.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg',
        mid,
        'Download album page',
        { query: { albummid: mid, format: 'json' } },
      )
    ).data || {};
    const entries: VideoInfo[] = [];
    for (const e of this._extractEntries(albumJson, ['list', '...'])) entries.push(e);
    return this.playlist_result(
      entries,
      mid,
      str_or_none(albumJson.name) ?? undefined,
      str_or_none(albumJson.desc)?.trim(),
    );
  }
}

export class QQMusicToplistIE extends QQPlaylistBaseIE {
  static IE_NAME = 'qqmusic:toplist';
  static IE_DESC = 'QQ音乐 - 排行榜';
  static _VALID_URL = /https?:\/\/y\.qq\.com\/n\/ryqq\/toplist\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const listId = this._match_id(url);
    const toplistJson = await this._download_json<Record<string, unknown>>(
      'http://i.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg',
      listId,
      'Download toplist page',
      { query: { type: 'toplist', topid: listId, format: 'json' } },
    );
    const entries: VideoInfo[] = [];
    for (const e of this._extractEntries(toplistJson, ['songlist', '...', 'data', '...'])) entries.push(e);
    const topinfo = (toplistJson.topinfo as Record<string, unknown>) || {};
    return this.playlist_result(
      entries,
      listId,
      join_nonempty(topinfo.ListName as string, toplistJson.update_time as string, ' '),
      topinfo.info as string | undefined,
    );
  }
}

export class QQMusicPlaylistIE extends QQPlaylistBaseIE {
  static IE_NAME = 'qqmusic:playlist';
  static IE_DESC = 'QQ音乐 - 歌单';
  static _VALID_URL = /https?:\/\/y\.qq\.com\/n\/ryqq\/playlist\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const listId = this._match_id(url);
    const query = new URLSearchParams({
      type: '1',
      json: '1',
      utf8: '1',
      onlysong: '0',
      disstid: listId,
    });
    const listUrl = `http://i.y.qq.com/qzone-music/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?${query}`;
    const rawText = await this._httpGetText(listUrl, { Referer: url });
    const listJson = JSON.parse(stripJsonp(rawText)) as Record<string, unknown>;
    const cdlist = (listJson.cdlist as Array<Record<string, unknown>>) || [];
    if (!cdlist.length) {
      throw new ExtractorError(
        join_nonempty(
          'Unable to get playlist info',
          String(listJson.code ?? ''),
          String(listJson.subcode ?? ''),
          String(listJson.msg ?? ''),
          ': ',
        ),
        { expected: true },
      );
    }
    const entries: VideoInfo[] = [];
    for (const e of this._extractEntries(listJson, ['cdlist', '0', 'songlist', '...'])) entries.push(e);
    return this.playlist_result(
      entries,
      listId,
      str_or_none(cdlist[0]?.dissname) ?? undefined,
      clean_html(str_or_none(cdlist[0]?.desc)) ?? undefined,
    );
  }
}

export class QQMusicVideoIE extends QQMusicBaseIE {
  static IE_NAME = 'qqmusic:mv';
  static IE_DESC = 'QQ音乐 - MV';
  static _VALID_URL = /https?:\/\/y\.qq\.com\/n\/ryqq\/mv\/(?<id>[0-9A-Za-z]+)/;

  protected _parseUrlFormats(urlData: Record<string, unknown>): Format[] {
    const mp4 = (urlData.mp4 as Array<Record<string, unknown>>) || [];
    return mp4
      .map((v) => {
        const mediaUrl = url_or_none((v.freeflow_url as string[])?.[0]);
        if (!mediaUrl) return null;
        return {
          url: mediaUrl,
          filesize: int_or_none(v.fileSize) ?? undefined,
          format_id: str_or_none(v.newFileType) || 'mp4',
        };
      })
      .filter(Boolean) as Format[];
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoInfo = await this._makeFcuReq(
      {
        mvInfo: {
          module: 'music.video.VideoData',
          method: 'get_video_info_batch',
          param: {
            vidlist: [videoId],
            required: ['vid', 'name', 'desc', 'cover_pic', 'duration', 'singers', 'playcnt', 'pubdate', 'play_forbid_reason'],
          },
        },
        mvUrl: {
          module: 'music.stream.MvUrlProxy',
          method: 'GetMvUrls',
          param: { vids: [videoId] },
        },
      },
      videoId,
      { headers: this.geo_verification_headers() },
    );
    const mvData = traverse_obj(videoInfo, ['mvInfo', 'data', videoId]) as Record<string, unknown>;
    if (mvData?.play_forbid_reason === 3) this.raise_geo_restricted();

    return {
      id: videoId,
      formats: this._parseUrlFormats(traverse_obj(videoInfo, ['mvUrl', 'data', videoId]) as Record<string, unknown>),
      title: str_or_none(mvData?.name) ?? undefined,
      description: str_or_none(mvData?.desc) ?? undefined,
      thumbnail: url_or_none(mvData?.cover_pic) ?? undefined,
      release_timestamp: int_or_none(mvData?.pubdate) ?? undefined,
      duration: int_or_none(mvData?.duration) ?? undefined,
      creators: ((mvData?.singers as Array<{ name?: string }>) || []).map((s) => s.name).filter(Boolean) as string[],
      view_count: int_or_none(mvData?.playcnt) ?? undefined,
    };
  }
}
