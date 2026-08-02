/**
 * CPACIE / CPACPlaylistIE — ported from yt-dlp cpac.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, unified_timestamp, update_url_query } from '../../utils';
import { urljoin } from './_helpers';

export class CPACIE extends InfoExtractor {
  static IE_NAME = 'cpac';
  static _VALID_URL = /https?:\/\/(?:www\.)?cpac\.ca\/(?<fr>l-)?episode\?id=(?<id>[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const urlLang = url.includes('/l-episode?') ? 'fr' : 'en';

    const content = await this._download_json<Record<string, unknown>>(
      `https://www.cpac.ca/api/1/services/contentModel.json?url=/site/website/episode/index.xml&crafterSite=cpacca&id=${videoId}`,
      videoId,
    );
    const page = (content.page as Record<string, unknown>) || {};
    const details = (page.details as Record<string, unknown>) || {};
    const videoUrl = str_or_none(details.videoUrl);
    let formats: Format[] = [];
    let title: string | undefined = undefined;
    if (videoUrl) {
      title = str_or_none(details[`title_${urlLang}_t`]) ?? undefined;
      formats = await this._extract_m3u8_formats(videoUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');
      for (const fmt of formats) {
        const fmtLang = fmt.language;
        if (fmtLang === urlLang) fmt.language_preference = 10;
        else if (!fmtLang) fmt.language_preference = -1;
        else fmt.language_preference = -10;
      }
    }

    const category = str_or_none(details[`category_${urlLang}_t`]);

    return {
      id: videoId,
      formats,
      title,
      description: str_or_none(details[`description_${urlLang}_t`]) ?? undefined,
      timestamp: unified_timestamp(details.liveDateTime) ?? undefined,
      categories: category ? [category] : undefined,
      thumbnail: urljoin(url, str_or_none(details[`image_${urlLang}_s`]) || ''),
      is_live: details.type != null ? details.type === 'live' : undefined,
    };
  }
}

export class CPACPlaylistIE extends InfoExtractor {
  static IE_NAME = 'cpac:playlist';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?cpac\.ca\/(?:program|search|(?<fr>emission|rechercher))\?(?:[^&]+&)*?(?<id>(?:id=\d+|programId=\d+|key=[^&]+))/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const urlLang = /\/emission\?|\/rechercher\?/.test(url) ? 'fr' : 'en';
    const isProgram = /\/program\?|\/emission\?/.test(url);
    const plType = isProgram ? 'program' : 'search';
    const listType = isProgram ? 'itemList' : 'searchResult';
    let apiUrl = `https://www.cpac.ca/api/1/services/contentModel.json?url=/site/website/${plType}/index.xml&crafterSite=cpacca&${videoId}`;
    let content = await this._download_json<Record<string, unknown>>(apiUrl, videoId);

    const entries: string[] = [];
    const page0 = (content.page as Record<string, unknown>) || {};
    const list0 = (page0[listType] as Record<string, unknown>) || {};
    const totalPages = int_or_none(list0.totalPages) ?? 1;

    for (let page = 1; page <= totalPages; page++) {
      if (page > 1) {
        apiUrl = update_url_query(apiUrl, { page: String(page) });
        content = await this._download_json<Record<string, unknown>>(apiUrl, videoId, `Downloading continuation - ${page}`, {
          fatal: false,
        });
      }
      const pageObj = (content.page as Record<string, unknown>) || {};
      const listObj = (pageObj[listType] as Record<string, unknown>) || {};
      const items = Array.isArray(listObj.item) ? (listObj.item as Record<string, unknown>[]) : [];
      for (const item of items) {
        const episodeUrl = urljoin(url, str_or_none(item[`url_${urlLang}_s`]) || '');
        if (episodeUrl) entries.push(episodeUrl);
      }
    }

    const pageFinal = (content.page as Record<string, unknown>) || {};
    const program = (pageFinal.program as Record<string, unknown>) || {};

    return this.playlist_result(
      entries.map((e) => this.url_result(e)),
      videoId,
      str_or_none(program[`title_${urlLang}_t`]) || videoId.split('=').pop(),
      str_or_none(program[`description_${urlLang}_t`]),
    );
  }
}
