/** StarTrekIE — ported from yt-dlp startrek.py */



import { InfoExtractor } from '../../common';

import type { Subtitle, VideoInfo } from '../../types';

import { clean_html, update_url_query, url_or_none } from '../../utils';

import { parse_iso8601, searchNextjsData } from './_helpers';



export class StarTrekIE extends InfoExtractor {

  static IE_NAME = 'startrek';

  static IE_DESC = 'STAR TREK';

  static _VALID_URL = /https?:\/\/(?:www\.)?startrek\.com(?:\/en-(?:ca|un))?\/videos\/(?<id>[^/?#]+)/;



  async _real_extract(url: string): Promise<VideoInfo> {

    const videoId = this._match_id(url);

    const webpage = await this._download_webpage(url, videoId);

    const pageProps = (searchNextjsData(this, webpage, videoId).pageProps || {}) as Record<string, unknown>;

    const videoData = ((pageProps.video as Record<string, unknown>)?.data || {}) as Record<string, unknown>;

    const youtubeId = videoData.youtube_video_id;

    if (youtubeId) return this.url_result(String(youtubeId), 'Youtube');



    let seriesId: string | undefined;

    for (const item of (videoData.series_and_movies as Record<string, unknown>[]) || []) {

      const slug = (item.series_or_movie as Record<string, unknown> | undefined)?.slug;

      if (typeof slug === 'string') {

        seriesId = slug;

        break;

      }

    }



    let series: string | undefined;

    const queried = pageProps.queried as Record<string, unknown> | undefined;

    const header = queried?.header as Record<string, unknown> | undefined;

    const tab3 = header?.tab3 as Record<string, unknown> | undefined;

    const slices = (tab3?.slices as Array<Record<string, unknown>>) || [];

    for (const slice of slices) {

      const items = (slice.items as Array<Record<string, unknown>>) || [];

      for (const item of items) {

        const link = item.link as Record<string, unknown> | undefined;

        if (link && link.slug === seriesId) {
          series = clean_html(String(link.link_copy || '')) || undefined;

          break;

        }

      }

      if (series) break;

    }



    const titleParts = (videoData.title as Array<Record<string, unknown>>) || [];

    const altParts = (videoData.subhead as Array<Record<string, unknown>>) || [];

    const descParts: string[] = [];

    for (const slice of (videoData.slices as Array<Record<string, unknown>>) || []) {

      const primary = slice.primary as Record<string, unknown> | undefined;

      for (const c of (primary?.content as Array<Record<string, unknown>>) || []) {

        if (c.text) {
          const text = clean_html(String(c.text));
          if (text) descParts.push(text);
        }

      }

    }

    const categories: string[] = [];

    const catData = (videoData.category as Record<string, unknown>)?.data as Record<string, unknown> | undefined;

    if (catData?.category_name) categories.push(String(catData.category_name).toUpperCase());



    const subtitles: Record<string, Subtitle[]> = {};

    const subUrl = videoData.legacy_subtitle_file as string | undefined;

    if (subUrl) subtitles.en = [{ url: subUrl, ext: 'vtt' }];



    const poster = videoData.poster_frame as Record<string, unknown> | undefined;

    const thumb = url_or_none(poster?.url);



    return {

      id: videoId,

      series,

      series_id: seriesId,

      title: titleParts.map((t) => clean_html(String(t.text || ''))).find(Boolean),

      alt_title: altParts.map((t) => clean_html(String(t.text || ''))).find(Boolean),

      categories: categories.length ? categories : undefined,

      description: descParts.find(Boolean),

      release_timestamp: parse_iso8601(videoData.published) ?? undefined,

      subtitles,

      thumbnail: thumb ? update_url_query(thumb, {}) : undefined,

      url: url_or_none(videoData.legacy_video_url) || undefined,

    };

  }

}

