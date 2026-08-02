/**
 * BrainPOPIE family — ported from yt-dlp brainpop.py
 * Login flow is not portable to this runtime; _perform_login is omitted.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';
import { urljoin } from './_helpers';

type ExtraFields = Record<string, unknown>;

export class BrainPOPBaseIE extends InfoExtractor {
  static IE_NAME = 'brainpopbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _NETRC_MACHINE = 'brainpop';
  protected static _ORIGIN = '';
  protected static _VIDEO_URL = '';
  protected static _HLS_URL = '';
  protected static _CDN_URL = '';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('BrainPOPBaseIE is not a standalone extractor', { expected: true });
  }

  private get _urls(): { VIDEO_URL: string; HLS_URL: string; CDN_URL: string } {
    const Ctor = this.constructor as unknown as { _VIDEO_URL: string; _HLS_URL: string; _CDN_URL: string };
    return { VIDEO_URL: Ctor._VIDEO_URL, HLS_URL: Ctor._HLS_URL, CDN_URL: Ctor._CDN_URL };
  }

  protected async _assembleFormats(
    slug: string,
    formatId: string,
    displayId: string,
    token = '',
    extraFields: ExtraFields = {},
  ): Promise<Format[]> {
    const { VIDEO_URL, HLS_URL } = this._urls;
    const formats = await this._extract_m3u8_formats(
      `${urljoin(HLS_URL, slug)}.m3u8?${token}`,
      displayId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      `${formatId}-hls`,
      undefined,
      false,
    );
    formats.push({ format_id: formatId, url: `${urljoin(VIDEO_URL, slug)}?${token}` });
    for (const f of formats) Object.assign(f, extraFields);
    return formats;
  }

  protected async _extractAdaptiveFormats(
    data: Record<string, unknown>,
    token: string,
    displayId: string,
    keyFormat = '%s',
    extraFields: ExtraFields = {},
  ): Promise<Format[]> {
    const formats: Format[] = [];
    const additionalKeyFormats: Record<string, ExtraFields> = {
      '%s': {},
      'ad_%s': { format_note: 'Audio description', source_preference: -2 },
    };
    for (const [additionalKeyFormat, additionalKeyFields] of Object.entries(additionalKeyFormats)) {
      const keys = ['high', 'low'];
      for (let keyQuality = 0; keyQuality < keys.length; keyQuality++) {
        const keyIndex = keys[keyQuality]!;
        const fullKeyIndex = additionalKeyFormat.replace('%s', keyFormat.replace('%s', keyIndex));
        const slug = data[fullKeyIndex];
        if (slug) {
          formats.push(
            ...(await this._assembleFormats(String(slug), fullKeyIndex, displayId, token, {
              quality: -1 - keyQuality,
              ...additionalKeyFields,
              ...extraFields,
            })),
          );
        }
      }
    }
    return formats;
  }
}

export class BrainPOPIE extends BrainPOPBaseIE {
  static IE_NAME = 'brainpop';
  static _VALID_URL = /https?:\/\/(?:www\.)?brainpop\.com\/(?<slug>[^/]+\/[^/]+\/(?<id>[^/?#&]+))/;
  protected static _ORIGIN = 'https://www.brainpop.com';
  protected static _VIDEO_URL = 'https://svideos.brainpop.com';
  protected static _HLS_URL = 'https://hls.brainpop.com';
  protected static _CDN_URL = 'https://cdn.brainpop.com';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const slug = m.groups!.slug!;
    const displayId = m.groups!.id!;

    const movieResp = await this._download_json<{ data: Record<string, unknown> }>(
      `https://api.brainpop.com/api/content/published/bp/en/${slug}/movie?full=1`,
      displayId,
      'Downloading movie data JSON',
    );
    const movieData = movieResp.data;

    const topicResp = await this._download_json<{ data?: { topic?: Record<string, unknown> } }>(
      `https://api.brainpop.com/api/content/published/bp/en/${slug}?full=1`,
      displayId,
      'Downloading topic data JSON',
      { fatal: false },
    );
    const topicData =
      (traverse_obj(topicResp, ['data', 'topic']) as Record<string, unknown> | undefined) ||
      (movieData.topic as Record<string, unknown>);

    const access = (movieData.access as Record<string, unknown>) || {};
    if (!access.allow) {
      const reason = (access.reason as string) || '';
      if (reason.includes('logged')) this.raise_login_required(reason);
      else this.raise_no_formats(reason);
    }

    const movieFeature = (movieData.feature as Record<string, unknown>) || {};
    const movieFeatureData = (movieFeature.data as Record<string, unknown>) || {};

    let formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    formats.push(
      ...(await this._extractAdaptiveFormats(movieFeatureData, (movieFeatureData.token as string) || '', displayId, '%s_v2', {
        language: movieFeature.language || 'en',
        language_preference: 10,
      })),
    );

    const localization = (movieFeature.localization as Record<string, Record<string, unknown>>) || {};
    for (const [lang, localizedFeature] of Object.entries(localization)) {
      formats.push(
        ...(await this._extractAdaptiveFormats(localizedFeature, (localizedFeature.token as string) || '', displayId, '%s_v2', {
          language: lang,
          language_preference: -10,
        })),
      );
    }

    for (const [name, rawUrl] of Object.entries(movieFeatureData)) {
      const langMatch = name.match(/^subtitles_(?<lang>\w+)$/);
      if (langMatch?.groups?.lang && rawUrl) {
        (subtitles[langMatch.groups.lang] ||= []).push({
          ext: 'vtt',
          url: urljoin(BrainPOPIE._CDN_URL, String(rawUrl)),
        });
      }
    }

    return {
      id: String(topicData?.topic_id ?? displayId),
      display_id: displayId,
      title: (topicData?.name as string) || undefined,
      description: (topicData?.synopsis as string) || undefined,
      formats,
      subtitles,
    };
  }
}

/**
 * Shared _real_extract for legacy BrainPOP sites (Jr/ELL/Esp/Fr/Il).
 * _VALID_URL is false here because _ORIGIN is per-subclass, but the
 * extraction logic itself is real and inherited unchanged by concrete
 * subclasses below (mirrors upstream's BrainPOPLegacyBaseIE).
 */
export class BrainPOPLegacyBaseIE extends BrainPOPBaseIE {
  static IE_NAME = 'brainpoplegacybase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  protected _parseJsTopicData(topicData: Record<string, unknown>, displayId: string, token: string): Promise<Format[]> {
    const movieData = (topicData.movies as Record<string, unknown>) || {};
    return this._extractAdaptiveFormats(movieData, token, displayId);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const topicData = this._search_json<Record<string, unknown>>(/var\s+content\s*=\s*/, webpage, 'content data', displayId);
    const category = (topicData?.category as Record<string, unknown>) || {};
    const unit = (category.unit as Record<string, unknown>) || {};
    const topic = (unit.topic as Record<string, unknown>) || {};
    const token = this._search_regex(/ec_token\s*:\s*['"]([^'"]+)/, webpage, 'video token') || '';

    const formats = await this._parseJsTopicData(topic, displayId, token);
    return {
      id: String(topic.EntryID ?? displayId),
      display_id: displayId,
      title: (topic.name as string) || undefined,
      alt_title: (topic.title as string) || undefined,
      description: (topic.synopsis as string) || undefined,
      formats,
    };
  }
}

export class BrainPOPJrIE extends BrainPOPLegacyBaseIE {
  static IE_NAME = 'brainpopjr';
  static _VALID_URL = /https?:\/\/jr\.brainpop\.com\/(?<slug>[^/]+\/[^/]+\/(?<id>[^/?#&]+))/;
  protected static _ORIGIN = 'https://jr.brainpop.com';
  protected static _VIDEO_URL = 'https://svideos-jr.brainpop.com';
  protected static _HLS_URL = 'https://hls-jr.brainpop.com';
  protected static _CDN_URL = 'https://cdn-jr.brainpop.com';
}

export class BrainPOPELLIE extends BrainPOPLegacyBaseIE {
  static IE_NAME = 'brainpopell';
  static _VALID_URL = /https?:\/\/ell\.brainpop\.com\/(?<slug>[^/]+\/[^/]+\/(?<id>[^/?#&]+))/;
  protected static _ORIGIN = 'https://ell.brainpop.com';
  protected static _VIDEO_URL = 'https://svideos-esl.brainpop.com';
  protected static _HLS_URL = 'https://hls-esl.brainpop.com';
  protected static _CDN_URL = 'https://cdn-esl.brainpop.com';
}

export class BrainPOPEspIE extends BrainPOPLegacyBaseIE {
  static IE_NAME = 'brainpopesp';
  static IE_DESC = 'BrainPOP Español';
  static _VALID_URL = /https?:\/\/esp\.brainpop\.com\/(?<slug>[^/]+\/[^/]+\/(?<id>[^/?#&]+))/;
  protected static _ORIGIN = 'https://esp.brainpop.com';
  protected static _VIDEO_URL = 'https://svideos.brainpop.com';
  protected static _HLS_URL = 'https://hls.brainpop.com';
  protected static _CDN_URL = 'https://cdn.brainpop.com/mx';
}

export class BrainPOPFrIE extends BrainPOPLegacyBaseIE {
  static IE_NAME = 'brainpopfr';
  static IE_DESC = 'BrainPOP Français';
  static _VALID_URL = /https?:\/\/fr\.brainpop\.com\/(?<slug>[^/]+\/[^/]+\/(?<id>[^/?#&]+))/;
  protected static _ORIGIN = 'https://fr.brainpop.com';
  protected static _VIDEO_URL = 'https://svideos.brainpop.com';
  protected static _HLS_URL = 'https://hls.brainpop.com';
  protected static _CDN_URL = 'https://cdn.brainpop.com/fr';
}

export class BrainPOPIlIE extends BrainPOPLegacyBaseIE {
  static IE_NAME = 'brainpopil';
  static IE_DESC = 'BrainPOP Hebrew';
  static _VALID_URL = /https?:\/\/il\.brainpop\.com\/(?<slug>[^/]+\/[^/]+\/(?<id>[^/?#&]+))/;
  protected static _ORIGIN = 'https://il.brainpop.com';
  protected static _VIDEO_URL = 'https://svideos.brainpop.com';
  protected static _HLS_URL = 'https://hls.brainpop.com';
  protected static _CDN_URL = 'https://cdn.brainpop.com/he';
}
