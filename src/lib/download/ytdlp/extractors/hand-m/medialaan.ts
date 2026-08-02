/** MedialaanBaseIE / MedialaanIE — ported from yt-dlp medialaan.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  extract_attributes,
  int_or_none,
  str_or_none,
  url_or_none,
} from '../../utils';

export class MedialaanBaseIE extends InfoExtractor {
  static IE_NAME = 'medialaanbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('MedialaanBaseIE is not a standalone extractor');
  }

  protected async _extractFromMychannelsApi(mychannelsId: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(`https://mychannels.video/embed/${mychannelsId}`, mychannelsId);
    const brandConfig =
      this._search_json<Record<string, unknown>>(/window\.mychannels\.brand_config\s*=/, webpage, 'brand config', mychannelsId, {
        fatal: false,
      }) || {};
    const response = await this._download_json<Record<string, unknown>>(
      `https://api.mychannels.world/v1/embed/video/${mychannelsId}`,
      mychannelsId,
      undefined,
      { headers: { 'X-Mychannels-Brand': String(brandConfig.brand ?? '') } },
    );

    const formats: Format[] = [];
    for (const stream of (response.streams as Array<Record<string, unknown>>) || []) {
      const sourceUrl = url_or_none(stream.url);
      if (!sourceUrl) continue;
      const ext = determine_ext(sourceUrl);
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            sourceUrl,
            mychannelsId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
          )),
        );
      } else {
        const formatId = str_or_none(stream.quality);
        formats.push({
          ext,
          format_id: formatId || ext,
          url: sourceUrl,
          ...parse_resolution(formatId || ''),
        });
      }
    }

    const durationMs = int_or_none(response.durationMs, 1000);
    const channel = (response.channel as Record<string, unknown>) || {};
    const organisation = (response.organisation as Record<string, unknown>) || {};
    const show = (response.show as Record<string, unknown>) || {};

    return {
      id: mychannelsId,
      formats,
      title: clean_html(str_or_none(response.title)) ?? undefined,
      description: clean_html(str_or_none(response.description)) ?? undefined,
      duration: durationMs != null && durationMs >= 0 ? durationMs : undefined,
      genres: response.genre ? [clean_html(String((response.genre as Record<string, unknown>).title))].filter(Boolean) as string[] : undefined,
      is_live: !!response.live,
      release_timestamp: int_or_none(response.publicationTimestampMs, 1000) ?? undefined,
      tags: ((response.tags as Array<Record<string, unknown>>) || [])
        .map((t) => str_or_none(t.title))
        .filter(Boolean) as string[],
      thumbnail: url_or_none((response.image as Record<string, unknown>)?.baseUrl) ?? undefined,
      channel: clean_html(str_or_none(channel.title)) ?? undefined,
      channel_id: str_or_none(channel.id) ?? undefined,
      uploader: clean_html(str_or_none(organisation.title)) ?? undefined,
      uploader_id: str_or_none(organisation.id) ?? undefined,
      series: clean_html(str_or_none(show.title)) ?? undefined,
      series_id: str_or_none(show.id) ?? undefined,
    };
  }
}

export class MedialaanIE extends MedialaanBaseIE {
  static IE_NAME = 'medialaan';
  static _VALID_URL =
    /https?:\/\/(?:(?:embed\.)?mychannels\.video\/embed\/|embed\.mychannels\.video\/(?:s(?:dk|cript)\/)?production\/|(?:www\.)?(?:(?:7sur7|demorgen|hln|joe|qmusic)\.be|(?:[abe]d|bndestem|destentor|gelderlander|pzc|tubantia|volkskrant)\.nl)\/videos?(?:[^/?#]+\/)*[^/?&#]+(?:-|~p))(?<id>\d+)/;

  static *_extractEmbedUrls(_url: string, webpage: string): Generator<string> {
    for (const m of webpage.matchAll(/<div\b[^>]*\bdata-mychannels-type=["']video["'][^>]*>/gi)) {
      const attrs = extract_attributes(m[0] || '');
      const id = attrs['data-mychannels-id'];
      if (id) yield `https://mychannels.video/embed/${id}`;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractFromMychannelsApi(this._match_id(url));
  }
}

function parse_resolution(label: string): { width?: number; height?: number } {
  const m = label.match(/(\d{3,4})p/i) || label.match(/(\d+)x(\d+)/i);
  if (!m) return {};
  if (m[2]) return { width: Number(m[1]), height: Number(m[2]) };
  return { height: Number(m[1]) };
}
