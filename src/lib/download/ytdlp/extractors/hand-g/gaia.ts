/**
 * GaiaIE — ported from yt-dlp gaia.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { int_or_none, try_get } from '../../utils';
import { stripOrNone, urlencodePostdata } from './_helpers';

export class GaiaIE extends InfoExtractor {
  static IE_NAME = 'gaia';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?gaia\.com\/video\/(?<id>[^/?]+).*?\bfullplayer=(?<type>feature|preview)/;
  static _NETRC_MACHINE = 'gaia';

  protected _jwt: string | null = null;

  protected async _real_initialize(): Promise<void> {
    const cookies = await this._get_cookies('https://www.gaia.com/');
    const auth = cookies.auth;
    if (auth) {
      try {
        const parsed = this._parse_json<{ jwt?: string }>(
          decodeURIComponent(auth),
          undefined,
          null,
          false,
        );
        this._jwt = parsed?.jwt ?? null;
      } catch {
        /* ignore */
      }
    }
  }

  protected async _perform_login(username: string, password: string): Promise<void> {
    if (this._jwt) return;
    const auth = await this._download_json<{ success?: boolean; messages?: string[]; jwt?: string }>(
      'https://auth.gaia.com/v1/login',
      undefined,
      'Logging in',
      { data: urlencodePostdata({ username, password }) },
    );
    if (auth.success === false) {
      throw new ExtractorError((auth.messages || []).join(', '), { expected: true });
    }
    this._jwt = auth.jwt ?? null;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._real_initialize();
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.id!;
    const vtype = m.groups!.type as 'feature' | 'preview';

    const nodeId = (
      await this._download_json<{ id: number }>('https://brooklyn.gaia.com/pathinfo', displayId, undefined, {
        query: { path: `video/${displayId}` },
      })
    ).id;

    const node = await this._download_json<Record<string, unknown>>(
      `https://brooklyn.gaia.com/node/${nodeId}`,
      String(nodeId),
    );
    const vdata = (node[vtype] as Record<string, unknown>) || {};
    const mediaId = String(vdata.nid ?? '');
    const title = node.title as string | undefined;

    const headers: Record<string, string> | undefined = this._jwt
      ? { Authorization: `Bearer ${this._jwt}` }
      : undefined;
    const media = await this._download_json<Record<string, unknown>>(
      `https://brooklyn.gaia.com/media/${mediaId}`,
      mediaId,
      undefined,
      { headers },
    );

    const formats = await this._extract_m3u8_formats(
      (media.mediaUrls as Record<string, string>)?.bcHLS,
      mediaId,
      'mp4',
    );

    const subtitles: Record<string, Subtitle[]> = {};
    const textTracks = (media.textTracks as Record<string, Record<string, string>>) || {};
    for (const key of ['captions', 'subtitles'] as const) {
      for (const [lang, subUrl] of Object.entries(textTracks[key] || {})) {
        (subtitles[lang] ||= []).push({ url: subUrl, ext: 'vtt' });
      }
    }

    const fivestar = (node.fivestar as Record<string, unknown>) || {};
    const fields = (node.fields as Record<string, Record<string, Array<Record<string, unknown>>>>) || {};

    const getFieldValue = (key: string, valueKey = 'value'): unknown =>
      try_get(fields, [(x) => x[key]?.[0]?.[valueKey]]);

    return {
      id: mediaId,
      display_id: displayId,
      title,
      formats,
      description:
        stripOrNone(String(getFieldValue('body') ?? getFieldValue('teaser') ?? '')) || undefined,
      timestamp: int_or_none(node.created) ?? undefined,
      subtitles,
      duration: int_or_none(vdata.duration) ?? undefined,
      like_count: int_or_none(try_get(fivestar, [(x) => (x.up_count as Record<string, unknown>)?.value])) ?? undefined,
      dislike_count:
        int_or_none(try_get(fivestar, [(x) => (x.down_count as Record<string, unknown>)?.value])) ?? undefined,
      comment_count: int_or_none(node.comment_count) ?? undefined,
      series: try_get(node, [(x) => (x.series as Record<string, unknown>)?.title as string]) || undefined,
      season_number: int_or_none(getFieldValue('season')) ?? undefined,
      season_id: String(getFieldValue('series_nid', 'nid') ?? '') || undefined,
      episode_number: int_or_none(getFieldValue('episode')) ?? undefined,
    };
  }
}
