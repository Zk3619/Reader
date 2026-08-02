/**
 * KhanAcademyBaseIE / KhanAcademyIE / KhanAcademyUnitIE — ported from yt-dlp khanacademy.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601, urljoin } from './_helpers';

export class KhanAcademyBaseIE extends InfoExtractor {
  static IE_NAME = 'khanacademybase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected _PUBLISHED_CONTENT_VERSION = 'dc34750f0572c80f5effe7134082fe351143c1e4';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('KhanAcademyBaseIE is not a standalone extractor', { expected: true });
  }

  protected _parseVideo(video: Record<string, unknown>): VideoInfo {
    return {
      _type: 'url_transparent',
      url: String(video.youtubeId ?? ''),
      id: String(video.youtubeId ?? ''),
      ie_key: 'Youtube',
      display_id: str_or_none(video.id) ?? undefined,
      title: str_or_none(video.translatedTitle) ?? undefined,
      thumbnail: url_or_none(traverse_obj(video, ['thumbnailUrls', 0, 'url'])) ?? undefined,
      duration: int_or_none(video.duration) ?? undefined,
      description: str_or_none(video.description) ?? undefined,
    };
  }

  protected async _fetchContent(displayId: string): Promise<Record<string, unknown>> {
    const resp = await this._download_json<{ data?: { contentRoute?: { listedPathData?: Record<string, unknown> } } }>(
      'https://www.khanacademy.org/api/internal/graphql/ContentForPath',
      displayId,
      undefined,
      {
        query: {
          fastly_cacheable: 'persist_until_publish',
          pcv: this._PUBLISHED_CONTENT_VERSION,
          hash: '3712657851',
          variables: JSON.stringify({
            path: displayId,
            countryCode: 'US',
            kaLocale: 'en',
            clientPublishedContentVersion: this._PUBLISHED_CONTENT_VERSION,
          }),
          lang: 'en',
        },
      },
    );
    return resp.data?.contentRoute?.listedPathData || {};
  }

  protected async _parseComponentProps(
    _componentProps: Record<string, unknown>,
    _displayId: string,
  ): Promise<VideoInfo> {
    throw new ExtractorError('Subclass must implement _parseComponentProps', { expected: true });
  }
}

export class KhanAcademyIE extends KhanAcademyBaseIE {
  static IE_NAME = 'khanacademy';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?khanacademy\.org\/(?<id>(?:[^/]+\/){4}v\/[^?#/&]+)/;

  protected async _parseComponentProps(componentProps: Record<string, unknown>, _displayId: string): Promise<VideoInfo> {
    const video = componentProps.content as Record<string, unknown>;
    return {
      ...this._parseVideo(video),
      creators: (video.authorNames as string[] | undefined) || undefined,
      timestamp: parseIso8601(video.dateAdded) ?? undefined,
      license: str_or_none(video.kaUserLicense) ?? undefined,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const content = await this._fetchContent(displayId);
    return this._parseComponentProps(content, displayId);
  }
}

export class KhanAcademyUnitIE extends KhanAcademyBaseIE {
  static IE_NAME = 'khanacademy:unit';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?khanacademy\.org\/(?<id>(?:[^/]+\/){1,2}[^?#/&]+)\/?(?:[?#&]|$)/;

  protected async _parseComponentProps(componentProps: Record<string, unknown>, displayId: string): Promise<VideoInfo> {
    const course = componentProps.course as Record<string, unknown>;
    const unitChildren = (course.unitChildren as Array<Record<string, unknown>>) || [];
    const selectedUnit =
      unitChildren.find((v) => v.relativeUrl === `/${displayId}`) || course;

    const entries: VideoInfo[] = [];
    const walk = (node: Record<string, unknown>) => {
      for (const child of (node.unitChildren as Array<Record<string, unknown>>) || []) walk(child);
      for (const item of (node.allOrderedChildren as Array<Record<string, unknown>>) || []) {
        for (const curated of (item.curatedChildren as Array<Record<string, unknown>>) || []) {
          if (curated.contentKind === 'Video' && curated.canonicalUrl) {
            entries.push(
              this.url_result(
                urljoin('https://www.khanacademy.org', String(curated.canonicalUrl)),
                'KhanAcademy',
                undefined,
                str_or_none(curated.translatedTitle) ?? undefined,
              ),
            );
          }
        }
      }
    };
    walk(selectedUnit);

    return this.playlist_result(
      entries,
      str_or_none(selectedUnit.id) || displayId,
      str_or_none(selectedUnit.translatedTitle) ?? displayId,
      str_or_none(selectedUnit.translatedDescription) ?? undefined,
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const content = await this._fetchContent(displayId);
    return this._parseComponentProps(content, displayId);
  }
}
