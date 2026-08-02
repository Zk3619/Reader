/**
 * Minimal hand-written BASE InfoExtractors for hand-a families lacking HAND_OVERRIDES coverage.
 * These register ie_keys that exist in generated-registry but are not standalone URL matchers
 * (except AENetworksCollection / AENetworksShow, which have real playlist URLs upstream).
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';

const AE_BASE_URL =
  /https?:\/\/(?:(?:www|play|watch)\.)?(?<domain>(?:history(?:vault)?|aetv|mylifetime|lifetimemovieclub)\.com|fyi\.tv)\//i;

const AE_DOMAIN_BRAND: Record<string, string> = {
  'history.com': 'history',
  'aetv.com': 'aetv',
  'mylifetime.com': 'lifetime',
  'fyi.tv': 'fyi',
  'lifetimemovieclub.com': 'lmc',
  'historyvault.com': 'historyvault',
  'biography.com': 'biography',
};

export class AbemaTVBaseIE extends InfoExtractor {
  static IE_NAME = 'abematvbase';
  static _VALID_URL = false as const;
  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AbemaTVBaseIE is not a standalone extractor', { expected: true });
  }
}

export class ACastBaseIE extends InfoExtractor {
  static IE_NAME = 'acastbase';
  static _VALID_URL = false as const;
  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ACastBaseIE is not a standalone extractor', { expected: true });
  }
}

export class ADNBaseIE extends InfoExtractor {
  static IE_NAME = 'adnbase';
  static _VALID_URL = false as const;
  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ADNBaseIE is not a standalone extractor', { expected: true });
  }
}

export class AENetworksBaseIE extends InfoExtractor {
  static IE_NAME = 'aenetworksbase';
  static _VALID_URL = false as const;
  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AENetworksBaseIE is not a standalone extractor', { expected: true });
  }
}

export class AENetworksListBaseIE extends InfoExtractor {
  static IE_NAME = 'aenetworkslistbase';
  static _VALID_URL = false as const;
  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AENetworksListBaseIE is not a standalone extractor', { expected: true });
  }
}

export class AfreecaTVBaseIE extends InfoExtractor {
  static IE_NAME = 'afreecatvbase';
  static _VALID_URL = false as const;
  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AfreecaTVBaseIE is not a standalone extractor', { expected: true });
  }
}

export class AmazonMiniTVBaseIE extends InfoExtractor {
  static IE_NAME = 'amazonminitvbase';
  static _VALID_URL = false as const;
  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AmazonMiniTVBaseIE is not a standalone extractor', { expected: true });
  }
}

export class AntennaBaseIE extends InfoExtractor {
  static IE_NAME = 'antennabase';
  static _VALID_URL = false as const;
  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AntennaBaseIE is not a standalone extractor', { expected: true });
  }
}

export class AppleBaseIE extends InfoExtractor {
  static IE_NAME = 'applebase';
  static _VALID_URL = false as const;
  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AppleBaseIE is not a standalone extractor', { expected: true });
  }
}

export class ARDMediathekBaseIE extends InfoExtractor {
  static IE_NAME = 'ardmediathekbase';
  static _VALID_URL = false as const;
  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ARDMediathekBaseIE is not a standalone extractor', { expected: true });
  }
}

export class ARDAudiothekBaseIE extends InfoExtractor {
  static IE_NAME = 'ardaudiothekbase';
  static _VALID_URL = false as const;
  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ARDAudiothekBaseIE is not a standalone extractor', { expected: true });
  }
}

export class AudiodraftBaseIE extends InfoExtractor {
  static IE_NAME = 'audiodraftbase';
  static _VALID_URL = false as const;
  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AudiodraftBaseIE is not a standalone extractor', { expected: true });
  }
}

export class AudiusBaseIE extends InfoExtractor {
  static IE_NAME = 'audiusbase';
  static _VALID_URL = false as const;
  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AudiusBaseIE is not a standalone extractor', { expected: true });
  }
}

abstract class AENetworksListBaseImpl extends InfoExtractor {
  protected static _RESOURCE: string;
  protected static _ITEMS_KEY: string;
  protected static _PLAYLIST_TITLE_KEY: string;
  protected static _PLAYLIST_DESCRIPTION_KEY: string | null;
  protected static _FIELDS: string;

  protected _getDoc(_item: Record<string, unknown>): Record<string, unknown> {
    throw new ExtractorError('_getDoc must be overridden', { expected: true });
  }

  protected async _callApi(
    resource: string,
    slug: string,
    brand: string,
    fields: string,
  ): Promise<Record<string, unknown>> {
    const result = await this._download_json<{ data: Record<string, unknown> }>(
      'https://yoga.appsvcs.aetnd.com/graphql',
      slug,
      'Downloading A+E playlist GraphQL',
      {
        query: { brand },
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({
          query: `{
  ${resource}(slug: "${slug}") {
    ${fields}
  }
}`,
        }),
        method: 'POST',
      },
    );
    return (result.data?.[resource] as Record<string, unknown>) || {};
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const Ctor = this.constructor as typeof AENetworksListBaseImpl;
    const m = this._match_valid_url(url);
    if (!m?.groups) {
      throw new ExtractorError(`Could not parse A+E URL: ${url}`, { expected: true });
    }
    const { domain, id: slug } = m.groups as Record<string, string>;
    const brand = AE_DOMAIN_BRAND[domain!];
    if (!brand) {
      throw new ExtractorError(`Unknown A+E domain: ${domain}`, { expected: true });
    }

    const playlist = await this._callApi(Ctor._RESOURCE, slug!, brand, Ctor._FIELDS);
    const baseUrl = `https://watch.${domain}`;

    const entries: VideoInfo[] = [];
    for (const item of (playlist[Ctor._ITEMS_KEY] as Record<string, unknown>[]) || []) {
      const doc = this._getDoc(item);
      const canonical = doc.canonical as string | undefined;
      if (!canonical) continue;
      entries.push(this.url_result(baseUrl + canonical, 'AENetworks', String(doc.id ?? '')));
    }

    const description =
      Ctor._PLAYLIST_DESCRIPTION_KEY != null
        ? ((playlist[Ctor._PLAYLIST_DESCRIPTION_KEY] as string | undefined) ?? null)
        : null;

    return this.playlist_result(
      entries,
      String(playlist.id ?? slug),
      (playlist[Ctor._PLAYLIST_TITLE_KEY] as string | undefined) ?? slug,
      description,
    );
  }
}

export class AENetworksCollectionIE extends AENetworksListBaseImpl {
  static IE_NAME = 'aenetworks:collection';
  static _VALID_URL = new RegExp(
    String.raw`${AE_BASE_URL.source}(?:[^/]+/)*(?:list|collections)/(?<id>[^/?#&]+)/?(?:[?#&]|$)`,
    'i',
  );
  protected static _RESOURCE = 'list';
  protected static _ITEMS_KEY = 'items';
  protected static _PLAYLIST_TITLE_KEY = 'display_title';
  protected static _PLAYLIST_DESCRIPTION_KEY = null;
  protected static _FIELDS = `id
    display_title
    items {
      ... on ListVideoItem {
        doc {
          canonical
          id
        }
      }
    }`;

  protected _getDoc(item: Record<string, unknown>): Record<string, unknown> {
    return (item.doc as Record<string, unknown>) || {};
  }
}

export class AENetworksShowIE extends AENetworksListBaseImpl {
  static IE_NAME = 'aenetworks:show';
  static _VALID_URL = new RegExp(
    String.raw`${AE_BASE_URL.source}shows/(?<id>[^/?#&]+)/?(?:[?#&]|$)`,
    'i',
  );
  protected static _RESOURCE = 'series';
  protected static _ITEMS_KEY = 'episodes';
  protected static _PLAYLIST_TITLE_KEY = 'title';
  protected static _PLAYLIST_DESCRIPTION_KEY = 'description';
  protected static _FIELDS = `description
    id
    title
    episodes {
      canonical
      id
    }`;

  protected _getDoc(item: Record<string, unknown>): Record<string, unknown> {
    return item;
  }
}
