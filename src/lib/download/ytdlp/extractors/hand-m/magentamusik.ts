/** MagentaMusikIE — ported from yt-dlp magentamusik.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { extractSmilMediaUrls } from './_helpers';

export class MagentaMusikIE extends InfoExtractor {
  static IE_NAME = 'magentamusik';
  static _VALID_URL = /https?:\/\/(?:www\.)?magentamusik\.de\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const playerConfig = this._search_json<Record<string, unknown>>(
      /data-js-element="o-video-player__config">/,
      webpage,
      'player config',
      displayId,
      { fatal: false },
    );
    if (!playerConfig) throw new ExtractorError('No video found', { expected: true });

    const assetId = String(playerConfig.assetId ?? '');
    const assetDetails = await this._download_json<Record<string, unknown>>(
      `https://wcps.t-online.de/cvss/magentamusic/vodclient/v2/assetdetails/58938/${assetId}`,
      displayId,
      'Downloading asset details',
    );

    const videoId = str_or_none(
      traverse_obj(assetDetails, ['content', 'partnerInformation'], { get_all: true, expected_type: 'array' })?.find(
        (v: unknown) => traverse_obj(v, ['reference']),
      )
        ? traverse_obj(
            (traverse_obj(assetDetails, ['content', 'partnerInformation'], { get_all: true }) as unknown[])[0],
            ['reference'],
          )
        : null,
    );
    if (!videoId) throw new ExtractorError('Unable to extract video id');

    const vodData = await this._download_json<Record<string, unknown>>(
      `https://wcps.t-online.de/cvss/magentamusic/vodclient/v2/player/58935/${videoId}/Main%20Movie`,
      videoId,
    );
    const smilUrl = url_or_none(
      traverse_obj(vodData, ['content', 'feature', 'representations'], { get_all: true })?.flatMap((rep: unknown) =>
        traverse_obj(rep, ['contentPackages'], { get_all: true })?.map((pkg: unknown) =>
          url_or_none(traverse_obj(pkg, ['media', 'href'])),
        ),
      )?.find(Boolean),
    );

    const formats: Format[] = [];
    if (smilUrl) {
      const smil = await this._download_webpage(smilUrl, videoId);
      for (const mediaUrl of extractSmilMediaUrls(smil)) {
        formats.push({ url: mediaUrl, format_id: 'smil' });
      }
    }

    const metadata = traverse_obj(vodData, ['content', 'feature', 'metadata']) as Record<string, unknown>;
    const countries = metadata.countriesOfProduction;
    const location =
      Array.isArray(countries) && countries.length
        ? (countries as string[]).filter(Boolean).join(', ')
        : undefined;

    return {
      id: videoId,
      display_id: displayId,
      formats,
      title: str_or_none(metadata.title) ?? undefined,
      alt_title: str_or_none(metadata.originalTitle) ?? undefined,
      description: str_or_none(metadata.longDescription) ?? undefined,
      duration: int_or_none(metadata.runtimeInSeconds) ?? undefined,
      location,
      release_year: int_or_none(metadata.yearOfProduction) ?? undefined,
      categories: metadata.mainGenre ? [String(metadata.mainGenre)] : undefined,
    };
  }
}
