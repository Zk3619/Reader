/** 3Cat / TV3 / Catalunya Ràdio — ported from yt-dlp ccma.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import { clean_html, determine_ext, int_or_none, parse_duration, unified_timestamp, url_or_none } from '../../utils';

function parseResolution(label: string | undefined): { width?: number; height?: number } {
  const m = label?.match(/(\d+)\s*[xX]\s*(\d+)/);
  if (!m) return {};
  return { width: Number(m[1]), height: Number(m[2]) };
}

export class CCMAIE extends InfoExtractor {
  static IE_NAME = '3cat';
  static IE_DESC = '3Cat, TV3 and Catalunya Ràdio';
  static _VALID_URL = /^https?:\/\/(?:www\.)?3cat\.cat\/(?:3cat|tv3\/sx3)\/[^/?#]+\/(?<type>video|audio)\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const match = this._match_valid_url(url)!;
    const mediaType = match.groups!.type!;
    const mediaId = match.groups!.id!;

    const media = await this._download_json<Record<string, unknown>>(
      'http://api-media.3cat.cat/pvideo/media.jsp',
      mediaId,
      undefined,
      { query: { media: mediaType, idint: mediaId, format: 'dm' } },
    );

    const mediaObj = (media.media as Record<string, unknown>) || {};
    const mediaUrl = mediaObj.url;
    const formats: Format[] = [];
    if (Array.isArray(mediaUrl)) {
      for (const format_ of mediaUrl as Record<string, unknown>[]) {
        const formatUrl = url_or_none(format_?.file);
        if (!formatUrl) continue;
        if (determine_ext(formatUrl) === 'mpd') {
          formats.push(...(await this._extract_mpd_formats(formatUrl, mediaId, 'dash', undefined, false)));
          continue;
        }
        const label = format_.label as string | undefined;
        formats.push({ ...parseResolution(label), url: formatUrl, format_id: label || 'default' });
      }
    } else if (typeof mediaUrl === 'string') {
      formats.push({ format_id: 'direct', url: mediaUrl, vcodec: mediaType === 'audio' ? 'none' : undefined });
    }

    const informacio = (media.informacio as Record<string, unknown>) || {};
    const title = String(informacio.titol || '');
    const durada = (informacio.durada as Record<string, unknown>) || {};
    const duration =
      int_or_none(durada.milisegons, 1000) ?? parse_duration(durada.text as string | undefined) ?? undefined;
    const tematica = (informacio.tematica as Record<string, unknown>)?.text as string | undefined;
    const dataUtc = (informacio.data_emissio as Record<string, unknown>)?.utc as string | undefined;
    const timestamp = unified_timestamp(dataUtc) ?? undefined;

    const subtitles: Record<string, Subtitle[]> = {};
    let subtitols = media.subtitols;
    if (subtitols && !Array.isArray(subtitols)) subtitols = [subtitols];
    for (const st of (subtitols as Record<string, unknown>[]) || []) {
      const subUrl = st?.url as string | undefined;
      if (!subUrl) continue;
      const lang = (st.iso as string) || (st.text as string) || 'ca';
      if (!subtitles[lang]) subtitles[lang] = [];
      subtitles[lang]!.push({ url: subUrl, ext: 'vtt' });
    }

    const imatges = (media.imatges as Record<string, unknown>) || {};
    let thumbnails: Thumbnail[] | undefined;
    if (imatges.url) {
      thumbnails = [
        {
          url: String(imatges.url),
          width: int_or_none(imatges.amplada) ?? undefined,
          height: int_or_none(imatges.alcada) ?? undefined,
        },
      ];
    }

    let ageLimit: number | undefined;
    const codiEtic = (informacio.codi_etic as Record<string, unknown>)?.id as string | undefined;
    if (codiEtic) {
      const parts = codiEtic.split('_');
      if (parts.length === 2) ageLimit = parts[1] === 'TP' ? 0 : int_or_none(parts[1]) ?? undefined;
    }

    return {
      id: mediaId,
      title,
      description: clean_html(informacio.descripcio as string | undefined) ?? undefined,
      duration,
      timestamp,
      thumbnails,
      subtitles,
      formats,
      age_limit: ageLimit,
      alt_title: (informacio.titol_complet as string) || undefined,
      episode_number: int_or_none(informacio.capitol) ?? undefined,
      categories: tematica ? [tematica] : undefined,
      series: (informacio.programa as string) || undefined,
    };
  }
}
