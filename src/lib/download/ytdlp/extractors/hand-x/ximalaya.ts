// @ts-nocheck
/** XimalayaBaseIE / XimalayaIE / XimalayaAlbumIE �?ported from yt-dlp ximalaya.py */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, update_url_query } from '../../utils';
import { protoRelative, try_call } from './_helpers';
import { VideaIE } from '../hand-v/videa';

export abstract class XimalayaBaseIE extends InfoExtractor {
  static IE_NAME = 'ximalaya:base';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _GEO_COUNTRIES = ['CN'];
}

export class XimalayaIE extends XimalayaBaseIE {
  static IE_NAME = 'ximalaya';
  static IE_DESC = '喜马拉雅FM';
  static _VALID_URL =
    /https?:\/\/(?:www\.|m\.)?ximalaya\.com\/(?:(?<uid>\d+)\/)?sound\/(?<id>[0-9]+)/;

  static _decryptFilename(fileId: string, seed: number): string {
    let cgstr = '';
    const KEY_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ/\\:._-1234567890';
    let key = KEY_CHARS;
    let s = Number(seed);
    for (let i = 0; i < KEY_CHARS.length; i++) {
      s = Math.trunc(211 * s + 30031) % 65536;
      if (s < 0) s += 65536;
      const r = Math.trunc((s / 65536) * key.length);
      cgstr += key[r]!;
      key = key.slice(0, r) + key.slice(r + 1);
    }
    const parts = fileId.split('*');
    let filename = '';
    for (const part of parts) {
      if (/^\d+$/.test(part)) filename += cgstr[parseInt(part, 10)]!;
    }
    if (!filename.startsWith('/')) filename = `/${filename}`;
    return filename;
  }

  static _decryptUrlParams(encryptedParams: string): [string, string, string] {
    const bin = atob(encryptedParams);
    const params = VideaIE.rc4(bin, 'xkt3a41psizxrh9l').split('-');
    // sign, token, timestamp
    return [params[1]!, params[2]!, params[3]!];
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const scheme = url.startsWith('https') ? 'https' : 'http';
    const audioId = this._match_id(url);

    const audioInfo = await this._download_json<Record<string, unknown>>(
      `${scheme}://m.ximalaya.com/tracks/${audioId}.json`,
      audioId,
      'Downloading info json',
    );

    const formats: Format[] = [];

    if (audioInfo.is_paid) {
      const ts = Math.trunc(Date.now() / 1000);
      const vipInfo = await this._download_json<Record<string, unknown>>(
        `${scheme}://mpay.ximalaya.com/mobile/track/pay/${audioId}/${ts}`,
        audioId,
        'Downloading VIP info json',
        { query: { device: 'pc', isBackend: 'true', _: String(ts) } },
      );
      const filename = XimalayaIE._decryptFilename(
        String(vipInfo.fileId),
        Number(vipInfo.seed),
      );
      const [sign, token, timestamp] = XimalayaIE._decryptUrlParams(String(vipInfo.ep));
      const vipUrl = update_url_query(
        `${vipInfo.domain}/download/${vipInfo.apiVersion}${filename}`,
        {
          sign,
          token,
          timestamp,
          buy_key: vipInfo.buyKey as string,
          duration: vipInfo.duration as string | number,
        },
      );
      const fmt: Format = {
        format_id: 'vip',
        url: vipUrl,
        vcodec: 'none',
      };
      if (vipUrl.includes('_preview_')) {
        this.report_warning(
          'This tracks requires a VIP account. Using a sample instead. Login may be required.',
        );
        fmt.format_note = 'Sample';
        fmt.preference = -10;
        fmt.filesize = int_or_none(vipInfo.sampleLength) ?? undefined;
        fmt.duration = int_or_none(vipInfo.sampleDuration) ?? undefined;
      } else {
        fmt.filesize = int_or_none(vipInfo.totalLength) ?? undefined;
        fmt.duration = int_or_none(vipInfo.duration) ?? undefined;
      }
      fmt.abr = try_call(() => {
        if (fmt.filesize == null || fmt.duration == null) return undefined;
        const duration = Number(fmt.duration);
        if (!Number.isFinite(duration) || duration <= 0) return undefined;
        return (fmt.filesize * 8) / duration / 1024;
      });
      formats.push(fmt);
    }

    for (const [bps, k] of [
      [24, 'play_path_32'],
      [64, 'play_path_64'],
    ] as const) {
      const u = audioInfo[k];
      if (typeof u === 'string' && u) {
        formats.push({
          format_id: `${bps}k`,
          url: u,
          abr: bps,
          vcodec: 'none',
        });
      }
    }

    const thumbnails: Thumbnail[] = [];
    for (const k of Object.keys(audioInfo)) {
      if (!k.startsWith('cover_url')) continue;
      const thumbnail: Thumbnail = { id: k, url: String(audioInfo[k]) };
      if (k === 'cover_url_142') {
        thumbnail.width = 180;
        thumbnail.height = 180;
      }
      thumbnails.push(thumbnail);
    }

    const audioUploaderId = audioInfo.uid;
    const audioDescription = try_call(() =>
      String(audioInfo.intro)
        .replace(/\r\n\r\n\r\n /g, '\n')
        .replace(/\r\n/g, '\n'),
    );

    return {
      id: audioId,
      uploader: (audioInfo.nickname as string) || undefined,
      uploader_id: str_or_none(audioUploaderId) || undefined,
      uploader_url: audioUploaderId
        ? `${scheme}://www.ximalaya.com/zhubo/${audioUploaderId}/`
        : undefined,
      title: String(audioInfo.title || audioId),
      thumbnails: thumbnails.length ? thumbnails : undefined,
      description: audioDescription,
      categories: [audioInfo.category_name].filter(Boolean) as string[],
      duration: (audioInfo.duration as number) ?? undefined,
      view_count: (audioInfo.play_count as number) ?? undefined,
      like_count: (audioInfo.favorites_count as number) ?? undefined,
      formats,
    };
  }
}

export class XimalayaAlbumIE extends XimalayaBaseIE {
  static IE_NAME = 'ximalaya:album';
  static IE_DESC = '喜马拉雅FM 专辑';
  static _VALID_URL =
    /https?:\/\/(?:www\.|m\.)?ximalaya\.com\/(?:\d+\/)?album\/(?<id>[0-9]+)/;

  async _fetchPage(playlistId: string, pageIdx: number): Promise<Record<string, unknown>> {
    const res = await this._download_json<{ data: Record<string, unknown> }>(
      'https://www.ximalaya.com/revision/album/v1/getTracksList',
      playlistId,
      `Downloading tracks list page ${pageIdx}`,
      { query: { albumId: playlistId, pageNum: String(pageIdx) } },
    );
    return res.data;
  }

  _getEntries(pageData: Record<string, unknown>): VideoInfo[] {
    const tracks = (pageData.tracks as Array<Record<string, unknown>>) || [];
    return tracks.map((e) =>
      this.url_result(
        protoRelative(`//www.ximalaya.com${e.url}`) || `https://www.ximalaya.com${e.url}`,
        'ximalaya',
        e.trackId != null ? String(e.trackId) : undefined,
        e.title != null ? String(e.title) : undefined,
      ),
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const firstPage = await this._fetchPage(playlistId, 1);
    const pageSize = Number(firstPage.pageSize) || 1;
    const pageCount = Math.ceil(Number(firstPage.trackTotalCount) / pageSize);

    const entries = [...this._getEntries(firstPage)];
    for (let idx = 1; idx < pageCount; idx++) {
      const page = await this._fetchPage(playlistId, idx + 1);
      entries.push(...this._getEntries(page));
    }

    const title = traverse_obj(firstPage, ['tracks', 0, 'albumTitle']) as string | undefined;
    return this.playlist_result(entries, playlistId, title);
  }
}
