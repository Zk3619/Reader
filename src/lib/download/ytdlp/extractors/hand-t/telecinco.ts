/** Telecinco family ù?ported from yt-dlp telecinco.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  extract_attributes,
  int_or_none,
  join_nonempty,
  str_or_none,
  traverse_obj,
  update_url_query,
  url_or_none,
} from '../../utils';

const ASTRO_ISLAND_RE = /<astro-island\b[^>]+>/g;

export class TelecincoBaseIE extends InfoExtractor {
  static IE_NAME = 'telecincobase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TelecincoBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _parseContent(content: Record<string, unknown>, url: string): Promise<VideoInfo> {
    const tuples = content as Record<string, [unknown, unknown]>;
    const videoId = String(tuples.dataMediaId?.[1] ?? '');
    const config = await this._download_json<Record<string, unknown>>(String(tuples.dataConfig?.[1]), videoId, 'Downloading config JSON');
    const services = config.services as Record<string, string>;
    const caronte = await this._download_json<Record<string, unknown>>(services.caronte, videoId);
    if (traverse_obj(caronte, ['dls', 0, 'drm'])) this.report_drm(videoId);

    const stream = (caronte.dls as Array<{ stream?: string }>)?.[0]?.stream!;
    const origin = url.match(/^https?:\/\/[^/]+/)?.[0] || url;
    const headers = { Referer: url, Origin: origin };
    const geoHeaders = { ...headers, ...this.geo_verification_headers() };

    let cdn: Record<string, string>;
    try {
      const cerbero = await this._download_json<{ tokens?: { '1'?: { cdn?: Record<string, string> } } }>(
        String(caronte.cerbero),
        videoId,
        undefined,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...geoHeaders },
          data: JSON.stringify({
            bbx: caronte.bbx,
            gbx: (await this._download_json<Record<string, unknown>>(services.gbx, videoId)).gbx,
          }),
        },
      );
      cdn = cerbero.tokens?.['1']?.cdn || {};
    } catch (e) {
      throw new ExtractorError(`Telecinco cerbero failed: ${(e as Error).message}`, { expected: true, cause: e });
    }

    const m3u8Url = update_url_query(stream, cdn);
    const formats: Format[] = await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false, {
      headers: geoHeaders,
    });

    return {
      id: videoId,
      title: str_or_none(traverse_obj(config, ['info', 'title'])) ?? undefined,
      formats,
      thumbnail:
        url_or_none(tuples.dataPoster?.[1] as string) ||
        url_or_none(traverse_obj(config, ['poster', 'imageUrl'])) ||
        undefined,
      duration: int_or_none(tuples.dataDuration?.[1]) ?? undefined,
      http_headers: headers,
    };
  }
}

export class TelecincoIE extends TelecincoBaseIE {
  static IE_NAME = 'telecinco';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:telecinco\.es|cuatro\.com|mediaset\.es)\/(?:[^/]+\/)+(?<id>.+?)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const propsList: Record<string, unknown>[] = [];
    for (const tag of webpage.match(ASTRO_ISLAND_RE) || []) {
      const attrs = extract_attributes(tag);
      if (attrs.props) {
        try {
          propsList.push(JSON.parse(attrs.props));
        } catch {
          /* skip */
        }
      }
    }

    const tuplesList = propsList as unknown as Record<string, [unknown, unknown]>[];
    let description = tuplesList.map((p) => clean_html(String(p.leadParagraph?.[1] ?? ''))).filter(Boolean).join('');
    const mainContent = tuplesList
      .map(
        (p) =>
          (p.content as [unknown, Record<string, unknown>] | undefined)?.[1] ||
          ((p.articleData as [unknown, Record<string, unknown>] | undefined)?.[1]?.opening as
            | [unknown, Record<string, unknown>]
            | undefined)?.[1],
      )
      .find(Boolean) as Record<string, unknown> | undefined;

    const editorial = tuplesList.map((p) => String((p.editorialType as [unknown, string] | undefined)?.[1] ?? '')).find(Boolean);
    if (editorial && editorial !== 'VID') {
      const entries: VideoInfo[] = [];
      for (const props of tuplesList) {
        const article = (props.articleData as [unknown, Record<string, unknown>] | undefined)?.[1];
        if (!article) continue;
        const body = article.body as [unknown, unknown[]] | undefined;
        for (const section of [article.opening, ...(Array.isArray(body?.[1]) ? body[1] : [])] as Array<
          [unknown, unknown] | undefined
        >) {
          const inner = section?.[1];
          const items = Array.isArray(inner) ? inner : [inner];
          for (const p of items) {
            if (!p || typeof p !== 'object') continue;
            const type = String((p as { type?: [unknown, string] }).type?.[1] ?? '');
            const content = (p as { content?: [unknown, unknown] }).content?.[1];
            if (type === 'paragraph' && typeof content === 'string') {
              description = join_nonempty(description, content);
            } else if (type === 'video' && content && typeof content === 'object') {
              entries.push(await this._parseContent(content as Record<string, unknown>, url));
            }
          }
        }
      }
      const playlistId =
        propsList.map((p) => int_or_none((p.id as [unknown, number] | undefined)?.[1])).find((x) => x != null)?.toString() ||
        displayId;
      return this.playlist_result(
        entries,
        playlistId,
        str_or_none((mainContent as { dataTitle?: [unknown, string] })?.dataTitle?.[1]) ?? undefined,
        clean_html(description) || undefined,
      );
    }

    if (!mainContent) throw new ExtractorError('Unable to extract main content from webpage', { expected: true });
    const info = await this._parseContent(mainContent, url);
    info.description = clean_html(description) || undefined;
    return info;
  }
}
