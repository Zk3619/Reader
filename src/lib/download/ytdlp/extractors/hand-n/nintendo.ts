/** NintendoIE — ported from yt-dlp nintendo.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, unified_timestamp } from '../../utils';
import { urljoin } from './_helpers';

export class NintendoIE extends InfoExtractor {
  static IE_NAME = 'Nintendo';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nintendo\.com\/(?:(?<locale>\w{2}(?:-\w{2})?)\/)?nintendo-direct\/(?<slug>[^/?#]+)/;

  protected _createAssetUrl(path: string): string {
    return urljoin('https://assets.nintendo.com/', encodeURI(path));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const locale = m?.groups?.locale;
    const slug = m?.groups?.slug ?? this._match_id(url);
    const [, , countryPart] = (locale || 'US').split('-');
    const language = (locale || 'US').split('-')[0]?.toLowerCase() || 'en';
    const parsedLocale = `${language}_${(countryPart || locale || 'US').toUpperCase()}`;

    const response = await this._download_json<Record<string, unknown>>('https://graph.nintendo.com/', slug, undefined, {
      query: {
        operationName: 'NintendoDirect',
        variables: JSON.stringify({ locale: parsedLocale, slug }),
        extensions: JSON.stringify({
          persistedQuery: {
            version: 1,
            sha256Hash: '969b16fe9f08b686fa37bc44d1fd913b6188e65794bb5e341c54fa683a8004cb',
          },
        }),
      },
    });

    const directInfo = traverse_obj(response, ['data', 'direct']) as Record<string, unknown> | undefined;
    if (!directInfo) {
      throw new ExtractorError(`No Nintendo Direct with id ${slug} exists`, { expected: true });
    }

    const errors = ((response.errors as Array<{ message?: string }>) || [])
      .map((e) => e.message)
      .filter(Boolean)
      .join(', ');
    if (errors) throw new ExtractorError(`GraphQL API error: ${errors}`, { expected: true });

    const result: VideoInfo = {
      id: str_or_none(directInfo.id) ?? slug,
      display_id: slug,
      title: str_or_none(directInfo.name) ?? undefined,
      timestamp: unified_timestamp(directInfo.startDate) ?? undefined,
      description: str_or_none(traverse_obj(directInfo, ['description', 'text'])) ?? undefined,
      age_limit: int_or_none(traverse_obj(directInfo, ['contentRating', 'order'])) ?? undefined,
      tags: ((traverse_obj(directInfo, ['contentDescriptors']) as Array<{ label?: string }>) || [])
        .map((d) => str_or_none(d.label))
        .filter(Boolean) as string[],
      thumbnail: directInfo.thumbnail ? this._createAssetUrl(String(directInfo.thumbnail)) : undefined,
    };

    const assetId = str_or_none(traverse_obj(directInfo, ['video', 'publicId']));
    if (!assetId) {
      const youtubeId = str_or_none(directInfo.liveStream);
      if (!youtubeId) {
        throw new ExtractorError(`Could not find any video formats (${slug})`, { expected: true });
      }
      return {
        ...this.url_result(youtubeId, 'Youtube', undefined, result.title),
        _type: 'url_transparent',
        ...result,
      };
    }

    if (assetId.startsWith('Legacy Videos/')) {
      result._old_archive_ids = [`nintendo ${assetId.slice(14)}`];
    }
    result.formats = await this._extract_m3u8_formats(
      this._createAssetUrl(`/video/upload/sp_full_hd/v1/${assetId}.m3u8`),
      slug,
    );
    return result;
  }
}
