/** OnsenIE — ported from yt-dlp onsen.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  parse_qs,
  str_or_none,
  traverse_obj,
  unified_strdate,
  update_url_query,
  url_or_none,
} from '../../utils';

function stripUrlQuery(raw: string): string {
  try {
    const u = new URL(raw);
    u.search = '';
    return u.toString();
  } catch {
    return raw.split('?')[0] || raw;
  }
}

const API_HEADERS = { 'X-Client': 'onsen-web' };
const BASE_URL = 'https://www.onsen.ag';
const HEADERS = { Referer: `${BASE_URL}/` };

function getEncodedId(program: Record<string, unknown>): string {
  return btoa(String(program.id)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class OnsenIE extends InfoExtractor {
  static IE_NAME = 'onsen';
  static _NETRC_MACHINE = 'onsen';
  static _VALID_URL = /https?:\/\/(?:(?:share|www)\.)onsen\.ag\/program\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const programId = this._match_id(url);
    let programs: Record<string, unknown>;
    try {
      programs = await this._download_json<Record<string, unknown>>(
        `${BASE_URL}/web_api/programs/${programId}`,
        programId,
        undefined,
        { headers: API_HEADERS },
      );
    } catch (e) {
      const err = e as { cause?: { status?: number } };
      if (err.cause?.status === 404) throw new ExtractorError('Invalid URL', { expected: true });
      throw e;
    }

    const query = Object.fromEntries(
      Object.entries(parse_qs(url)).map(([k, v]) => [k, v[v.length - 1]]),
    ) as Record<string, string>;

    if (!query.c) {
      const contents = (programs.contents as Array<Record<string, unknown>>) || [];
      const entries = contents
        .filter((p) => p.id)
        .map((program) =>
          this.url_result(
            update_url_query(url.split('?')[0]!, { c: getEncodedId(program) }),
            'Onsen',
            str_or_none(program.id) ?? undefined,
          ),
        );
      return this.playlist_result(
        entries,
        programId,
        clean_html(String(traverse_obj(programs, ["program_info", "title"]) ?? '')) || undefined,
      );
    }

    const rawId = atob(`${query.c}${'='.repeat((4 - (query.c.length % 4)) % 4)}`);
    const program = ((programs.contents as Array<Record<string, unknown>>) || []).find(
      (v) => String(v.id) === rawId,
    );
    if (!program) throw new ExtractorError('This program is no longer available', { expected: true });

    const m3u8Url = url_or_none(program.streaming_url);
    if (!m3u8Url) this.raise_login_required('This program is only available for premium supporters');

    const displayId = getEncodedId(program);
    const dateMatch = m3u8Url.match(new RegExp(`${programId}0?(\\d{6})`));
    const dateStr = dateMatch?.[1];

    const performers = (programs.performers as Array<Record<string, unknown>>) || [];
    const guests = (program.guests as Array<Record<string, unknown>>) || [];
    const programInfo = (programs.program_info as Record<string, unknown>) || {};

    return {
      display_id: displayId,
      formats: await this._extract_m3u8_formats(
        m3u8Url,
        rawId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        { headers: HEADERS },
      ),
      http_headers: HEADERS,
      section_start: int_or_none(query.t ?? 0) ?? undefined,
      upload_date: unified_strdate(dateStr ? `20${dateStr}` : undefined) ?? undefined,
      webpage_url: `${BASE_URL}/program/${programId}?c=${displayId}`,
      id: rawId,
      title: clean_html(String(program.title ?? '')) || undefined,
      media_type: program.media_type as string | undefined,
      thumbnail: stripUrlQuery(url_or_none(program.poster_image_url) || '') || undefined,
      cast: [...performers, ...guests].map((p) => String(p.name ?? '')).filter(Boolean),
      series_id: programs.directory_name as string | undefined,
      description: clean_html(String(programInfo.description ?? '')) || undefined,
      series: clean_html(String(programInfo.title ?? '')) || undefined,
      tags: ((programInfo.hashtag_list as string[]) || []).filter(Boolean),
    };
  }
}
