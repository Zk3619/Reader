/**
 * IPrimaIE / IPrimaCNNIE — ported from yt-dlp iprima.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  js_to_json,
  traverse_obj,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, htmlExtractTitle, searchNextjsData } from './_helpers';

export class IPrimaIE extends InfoExtractor {
  static IE_NAME = 'iprima';
  static _NETRC_MACHINE = 'iprima';
  static _VALID_URL = /https?:\/\/(?!cnn)(?:[^/]+)\.iprima\.cz\/(?:[^/]+\/)*(?<id>[^/?#&]+)/;

  protected static accessToken: string | null = null;

  protected async _perform_login(username: string, password: string): Promise<void> {
    if (IPrimaIE.accessToken) return;
    const tokenData = await this._download_json<{ accessToken?: { value?: string } }>(
      'https://ucet.iprima.cz/api/session/create',
      undefined,
      'Logging in',
      {
        data: JSON.stringify({
          email: username,
          password,
          deviceName: 'Windows Chrome',
        }),
        headers: { 'content-type': 'application/json' },
      },
    );
    IPrimaIE.accessToken = tokenData.accessToken?.value || null;
    if (!IPrimaIE.accessToken) throw new ExtractorError('Failed to fetch access token');
  }

  protected async _real_initialize(): Promise<void> {
    if (!IPrimaIE.accessToken) {
      this.raise_login_required('Login is required to access any iPrima content', 'password');
    }
  }

  protected _raiseAccessError(errorCode: string | null | undefined): void {
    if (errorCode === 'PLAY_GEOIP_DENIED') {
      this.raise_geo_restricted(undefined, ['CZ']);
    } else if (errorCode != null) {
      this.raise_no_formats('Access to stream infos forbidden', true);
    }
  }

  protected _extractProductId(webpage: string, fallbackId: string): string | null {
    const fromRegex = this._search_regex(
      [
        /productId\s*=\s*(['"])(?<id>p\d+)\1/,
        /pproduct_id\s*=\s*(['"])(?<id>p\d+)\1/,
        /let\s+videos\s*=\s*(['"])(?<id>p\d+)\1/,
      ],
      webpage,
      'real id',
      null,
      false,
    );
    if (fromRegex) return fromRegex;

    const nuxtScript = this._search_json<unknown[]>(
      /<script[^>]+\bid=["']__NUXT_DATA__["'][^>]*>/,
      webpage,
      'nuxt data',
      fallbackId,
      { end_pattern: /<\/script>/, contains: true, fatal: false },
    );
    if (nuxtScript) {
      for (const v of nuxtScript) {
        if (typeof v === 'string' && /^p\d+$/.test(v)) return v;
      }
    }

    const props = searchNextjsData(this, webpage, fallbackId);
    const fromNext = (() => {
      for (const value of Object.values(props)) {
        const id = traverse_obj(value, ['content', 'additionals', 'videoPlayId']);
        if (typeof id === 'string' && /^p\d+$/.test(id)) return id;
      }
      return null;
    })();
    return fromNext || null;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._real_initialize();
    const pageId = this._match_id(url);
    const webpage = await this._download_webpage(url, pageId);

    const title =
      htmlExtractTitle(webpage) ||
      this._html_search_meta(['og:title', 'twitter:title'], webpage, 'title', false) ||
      pageId;

    const videoId = this._extractProductId(webpage, pageId);
    if (!videoId) this.raise_no_formats('Unable to extract video ID from webpage');

    const metadata = await this._download_json<{ errorCode?: string; streamInfos?: unknown[] }>(
      `https://api.play-backend.iprima.cz/api/v1//products/id-${videoId}/play`,
      videoId,
      'Getting manifest URLs',
      {
        headers: { 'X-OTT-Access-Token': IPrimaIE.accessToken! },
        fatal: false,
      },
    );

    this._raiseAccessError(metadata.errorCode);

    const streamInfos = metadata.streamInfos;
    const formats: Format[] = [];
    if (streamInfos == null) {
      this.raise_no_formats('Reading stream infos failed', true);
    } else {
      for (const manifest of streamInfos as Array<Record<string, unknown>>) {
        const manifestType = manifest.type != null ? String(manifest.type) : '';
        const manifestUrl = manifest.url != null ? String(manifest.url) : '';
        const ext = determine_ext(manifestUrl);
        if (manifestType === 'HLS' || ext === 'm3u8') {
          const res = await extractM3u8FormatsAndSubtitles(this, manifestUrl, videoId, 'hls');
          formats.push(...res.formats);
        } else if (manifestType === 'DASH' || ext === 'mpd') {
          formats.push(...(await this._extract_mpd_formats(manifestUrl, videoId, 'dash', undefined, false)));
        }
      }
    }

    const finalResult = this._search_json_ld(webpage, videoId, { fatal: false }) || {};
    return {
      ...finalResult,
      id: videoId,
      title: (finalResult.title as string) || title,
      thumbnail:
        this._html_search_meta(['thumbnail', 'og:image', 'twitter:image'], webpage, 'thumbnail', false) ||
        undefined,
      formats,
      description:
        this._html_search_meta(['description', 'og:description', 'twitter:description'], webpage, 'description', false) ||
        undefined,
    };
  }
}

export class IPrimaCNNIE extends InfoExtractor {
  static IE_NAME = 'iprima:cnn';
  static _VALID_URL = /https?:\/\/cnn\.iprima\.cz\/(?:[^/]+\/)*(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageId = this._match_id(url);
    const webpage = await this._download_webpage(url, pageId);

    const title =
      this._og_search_title(webpage) ||
      this._search_regex(/<h1>([^<]+)/, webpage, 'title', null, false) ||
      pageId;

    const videoId = this._search_regex(
      [
        /<iframe[^>]+\bsrc=["'](?:https?:)?\/\/(?:api\.play-backend\.iprima\.cz\/prehravac\/embedded|prima\.iprima\.cz\/[^/]+\/[^/]+)\?.*?\bid=(p\d+)/,
        /data-product="([^"]+)">/,
        /id=["']player-(p\d+)"/,
        /playerId\s*:\s*["']player-(p\d+)/,
        /\bvideos\s*=\s*["'](p\d+)/,
      ],
      webpage,
      'real id',
    )!;

    const playerpage = await this._download_webpage('http://play.iprima.cz/prehravac/init', videoId, 'Downloading player', {
      query: {
        _infuse: '1',
        _ts: String(Math.round(Date.now() / 1000)),
        productId: videoId,
      },
      headers: { Referer: url },
    });

    const formats: Format[] = [];

    const extractFormats = async (formatUrl: string, formatKey?: string | null, lang?: string | null) => {
      const ext = determine_ext(formatUrl);
      let newFormats: Format[] = [];
      if (formatKey === 'hls' || ext === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, formatUrl, videoId, 'hls');
        newFormats = res.formats;
      } else if (formatKey === 'dash' || ext === 'mpd') {
        return;
      }
      if (lang) {
        for (const f of newFormats) {
          if (!f.language) f.language = lang;
        }
      }
      formats.push(...newFormats);
    };

    const optionsRaw = this._search_regex(
      /(?:TDIPlayerOptions|playerOptions)\s*=\s*(\{.+?\});\s*\]\]/,
      playerpage,
      'player options',
      '{}',
      false,
    );
    const options = this._parse_json<Record<string, unknown>>(optionsRaw, videoId, js_to_json, false);
    if (options) {
      const tracks = (options.tracks as Record<string, unknown>) || {};
      for (const [key, trackList] of Object.entries(tracks)) {
        if (!Array.isArray(trackList)) continue;
        for (const track of trackList as Array<Record<string, unknown>>) {
          const src = track.src != null ? String(track.src) : '';
          if (src) await extractFormats(src, key.toLowerCase(), track.lang != null ? String(track.lang) : null);
        }
      }
    }

    if (!formats.length) {
      for (const m of playerpage.matchAll(/src["']\s*:\s*(["'])(.+?)\1/g)) {
        await extractFormats(m[2]!);
      }
    }

    if (!formats.length && playerpage.includes('>GEO_IP_NOT_ALLOWED<')) {
      this.raise_geo_restricted(undefined, ['CZ']);
    }

    return {
      id: videoId,
      title,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      formats,
      description: this._og_search_description(webpage) ?? undefined,
    };
  }
}
