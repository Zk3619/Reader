/** OnDemandChinaEpisodeIE — ported from yt-dlp odkmedia.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { float_or_none, traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, htmlExtractTitle, mergeSubtitles } from './_helpers';

const EPISODE_QUERY = `
        query Episode($programSlug: String!, $episodeNumber: Int!) {
            episode(
                programSlug: $programSlug
                episodeNumber: $episodeNumber
                kind: "series"
                part: null
            ) {
                id
                title
                titleEn
                titleKo
                titleZhHans
                titleZhHant
                synopsis
                synopsisEn
                synopsisKo
                synopsisZhHans
                synopsisZhHant
                videoDuration
                images {
                    thumbnail
                }
            }
        }`;

export class OnDemandChinaEpisodeIE extends InfoExtractor {
  static IE_NAME = 'ondemandchina';
  static _VALID_URL =
    /https?:\/\/www\.ondemandchina\.com\/\w+\/watch\/(?<series>[\w-]+)\/(?<id>ep-(?<ep>\d+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const programSlug = m.groups!.series!;
    const displayId = m.groups!.id!;
    const epNumber = m.groups!.ep!;
    const webpage = await this._download_webpage(url, displayId);

    const videoInfo = (
      await this._download_json<{ data?: { episode?: Record<string, unknown> } }>(
        'https://odc-graphql.odkmedia.io/graphql',
        displayId,
        undefined,
        {
          headers: { 'Content-type': 'application/json' },
          data: JSON.stringify({
            operationName: 'Episode',
            query: EPISODE_QUERY,
            variables: { programSlug, episodeNumber: parseInt(epNumber, 10) },
          }),
        },
      )
    ).data?.episode;
    if (!videoInfo) throw new ExtractorError('Episode not found', { expected: true });

    let sourceJson: Record<string, unknown>;
    try {
      sourceJson = await this._download_json<Record<string, unknown>>(
        `https://odkmedia.io/odc/api/v2/playback/${videoInfo.id}/`,
        displayId,
        undefined,
        { headers: { Authorization: '', 'service-name': 'odc' } },
      );
    } catch (e) {
      const err = e as { cause?: { response?: { detail?: string } } };
      const detail = err.cause?.response?.detail;
      if (detail) this.raise_geo_restricted(String(detail));
      throw e;
    }

    const formats: VideoInfo['formats'] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const source of traverse_obj(sourceJson, ["sources"], { default: [] }) as Array<Record<string, unknown>>) {
      if (source.type === 'hls') {
        const hlsUrl = url_or_none(source.url);
        if (hlsUrl) {
          const { formats: fmts, subtitles: subs } = await extractM3u8FormatsAndSubtitles(this, hlsUrl, displayId);
          formats.push(...fmts);
          mergeSubtitles(subtitles, subs);
        }
      } else {
        this.report_warning(`Unsupported format ${source.type}`);
      }
    }

    const title =
      (traverse_obj(videoInfo, 'title') as string | undefined) ||
      (traverse_obj(videoInfo, 'titleEn') as string | undefined) ||
      this._html_search_meta(['og:title', 'twitter:title'], webpage) ||
      htmlExtractTitle(webpage) ||
      undefined;

    return {
      id: String(videoInfo.id),
      duration: float_or_none(videoInfo.videoDuration, 1000) ?? undefined,
      thumbnail:
        (traverse_obj(videoInfo, ["images", "thumbnail"]) as string | undefined) ||
        this._html_search_meta(['og:image', 'twitter:image'], webpage) ||
        undefined,
      title,
      alt_title:
        (traverse_obj(videoInfo, 'titleKo') as string | undefined) ||
        (traverse_obj(videoInfo, 'titleZhHans') as string | undefined) ||
        (traverse_obj(videoInfo, 'titleZhHant') as string | undefined) ||
        undefined,
      description:
        (traverse_obj(videoInfo, 'synopsisEn') as string | undefined) ||
        (traverse_obj(videoInfo, 'synopsisKo') as string | undefined) ||
        (traverse_obj(videoInfo, 'synopsisZhHans') as string | undefined) ||
        (traverse_obj(videoInfo, 'synopsisZhHant') as string | undefined) ||
        (traverse_obj(videoInfo, 'synopisis') as string | undefined) ||
        this._html_search_meta(['og:description', 'twitter:description', 'description'], webpage) ||
        undefined,
      formats,
      subtitles,
      tags: this._html_search_meta('keywords', webpage)?.split(', '),
    };
  }
}
