// @ts-nocheck
/** WDRIE / WDRPageIE / WDRElefantIE â€?ported from yt-dlp wdr.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  dict_get,
  js_to_json,
  try_get,
  unified_strdate,
  url_or_none,
} from '../../utils';
import { extractSmilMediaUrls, stripJsonp, urljoin, xmlChildText } from './_helpers';

export class WDRIE extends InfoExtractor {
  static IE_NAME = 'WDR';
  static _API_URL_TPL = '//deviceids-medp.wdr.de/ondemand/%s/%s';
  static _VALID_URL =
    /https?:\/\/(?:deviceids-medp\.wdr\.de\/ondemand\/\d+\/|kinder\.wdr\.de\/(?!mediathek\/)[^#?]+-)(?<id>\d+)\.(?:js|assetjsonp)/;
  static _GEO_COUNTRIES = ['DE'];

  protected _assetUrl(wdrId: string): string {
    const idLen = Math.max(wdrId.length, 5);
    const prefix = wdrId.slice(0, idLen - 4);
    return `https:${WDRIE._API_URL_TPL.replace('%s', prefix).replace('%s', wdrId)}.js`;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    let videoId = this._match_id(url);
    let assetUrl = url;

    if (url.startsWith('wdr:')) {
      videoId = url.slice(4);
      assetUrl = this._assetUrl(videoId);
    }

    const raw = await this._download_webpage(assetUrl, videoId);
    const metadata = this._parse_json<Record<string, unknown>>(raw, videoId, stripJsonp)!;

    const isLive = metadata.mediaType === 'live';
    const trackerData = (metadata.trackerData as Record<string, unknown>) || {};
    const title = String(trackerData.trackerClipTitle || videoId);
    const mediaResource = (metadata.mediaResource as Record<string, unknown>) || {};

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    for (const [kind, media] of Object.entries(mediaResource)) {
      if (kind === 'captionsHash' && media && typeof media === 'object') {
        for (const [ext, capUrl] of Object.entries(media as Record<string, unknown>)) {
          if (typeof capUrl !== 'string') continue;
          if (!subtitles.de) subtitles.de = [];
          subtitles.de.push({ url: capUrl, ext });
        }
        continue;
      }

      if (kind !== 'dflt' && kind !== 'alt') continue;
      if (!media || typeof media !== 'object') continue;

      for (const [tagName, mediumUrlRaw] of Object.entries(media as Record<string, unknown>)) {
        if (tagName !== 'videoURL' && tagName !== 'audioURL') continue;
        const mediumUrl = typeof mediumUrlRaw === 'string' ? mediumUrlRaw : null;
        if (!mediumUrl) continue;

        const ext = determine_ext(mediumUrl);
        if (ext === 'm3u8') {
          formats.push(
            ...(await this._extract_m3u8_formats(
              mediumUrl,
              videoId,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              'hls',
            )),
          );
        } else if (ext === 'f4m') {
          /* f4m/HDS skipped in TS port */
        } else if (ext === 'smil') {
          const smilXml = await this._download_webpage(mediumUrl, videoId, undefined, {
            fatal: false,
          });
          for (const smilUrl of extractSmilMediaUrls(smilXml || '')) {
            formats.push({ format_id: 'smil', url: smilUrl });
          }
        } else {
          const aFormat: Format = { url: mediumUrl, format_id: ext || 'http' };
          if (ext === 'unknown_video') {
            const urlh = await this._request_webpage(mediumUrl, videoId, 'Determining extension', {
              fatal: false,
            });
            aFormat.ext = determine_ext(urlh?.url || mediumUrl) || 'mp4';
          }
          formats.push(aFormat);
        }
      }
    }

    const captionUrl = mediaResource.captionURL as string | undefined;
    if (captionUrl) {
      subtitles.de = [{ url: captionUrl, ext: 'ttml' }];
    }
    const captionsHash = mediaResource.captionsHash;
    if (captionsHash && typeof captionsHash === 'object') {
      for (const [ext, formatUrlRaw] of Object.entries(captionsHash as Record<string, unknown>)) {
        const formatUrl = url_or_none(formatUrlRaw);
        if (!formatUrl) continue;
        if (!subtitles.de) subtitles.de = [];
        subtitles.de.push({
          url: formatUrl,
          ext: determine_ext(formatUrl, '') || ext,
        });
      }
    }

    return {
      id: String(trackerData.trackerClipId || videoId),
      title,
      alt_title: (trackerData.trackerClipSubcategory as string) || undefined,
      formats,
      subtitles,
      upload_date: unified_strdate(trackerData.trackerClipAirTime) ?? undefined,
      is_live: isLive,
    };
  }
}

export class WDRPageIE extends WDRIE {
  static IE_NAME = 'WDR:page';
  static _MAUS_REGEX =
    /https?:\/\/(?:www\.)wdrmaus\.de\/(?:[^/]+\/)*?(?<maus_id>[^/?#.]+)(?:\/?|\/index\.php5|\.php5)$/;
  static _PAGE_REGEX = /\/(?:mediathek\/)?(?:[^/]+\/)*(?<display_id>[^/]+)\.html/;
  static _VALID_URL =
    /https?:\/\/(?:www\d?\.)?(?:(?:kinder\.)?wdr\d?|sportschau)\.de\/(?:mediathek\/)?(?:[^/]+\/)*(?<display_id>[^/]+)\.html|https?:\/\/(?:www\.)wdrmaus\.de\/(?:[^/]+\/)*?(?<maus_id>[^/?#.]+)(?:\/?|\/index\.php5|\.php5)$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const displayId = String(
      dict_get(mobj.groups || {}, ['display_id', 'maus_id'], 'wdrmaus') || 'wdrmaus',
    );
    const webpage = await this._download_webpage(url, displayId);

    const entries: VideoInfo[] = [];

    const mediaRe =
      /class=(?:(["'])(?:mediaLink|wdrrPlayerPlayBtn|videoButton)\b[\s\S]*?\1[^>]+|(["'])videoLink\b[\s\S]*?\2[\s]*>\n[^\n]*)data-extension(?:-ard)?=(["'])(?<data>(?:(?!\3)[\s\S])+)\3/g;
    for (const match of webpage.matchAll(mediaRe)) {
      const data = match.groups?.data;
      if (!data) continue;
      const mediaLinkObj = this._parse_json<Record<string, unknown>>(data, displayId, js_to_json, false);
      if (!mediaLinkObj) continue;
      let jsonpUrl = try_get(
        mediaLinkObj,
        (x) =>
          ((x as { mediaObj?: { url?: string } }).mediaObj?.url as string | undefined) || undefined,
      ) as string | undefined;
      if (!jsonpUrl) continue;
      let clipId = (mediaLinkObj.mediaObj as { ref?: string } | undefined)?.ref;
      if (jsonpUrl.endsWith('.assetjsonp')) {
        const assetRaw = await this._download_webpage(jsonpUrl, displayId, undefined, {
          fatal: false,
        });
        const asset = this._parse_json<Record<string, unknown>>(assetRaw, displayId, stripJsonp, false);
        clipId =
          try_get(asset, (x) => {
            const td = (x as { trackerData?: { trackerClipId?: string } })?.trackerData;
            return td?.trackerClipId;
          }) as string | undefined;
      }
      if (clipId) {
        jsonpUrl = this._assetUrl(clipId.slice(4));
      }
      entries.push(this.url_result(jsonpUrl, 'WDR'));
    }

    if (!entries.length) {
      for (const link of webpage.matchAll(
        /<a[^>]+\bhref=(["'])(?<href>(?:(?!\1)[\s\S])+)\1[^>]+\bdata-extension(?:-ard)?=/g,
      )) {
        const href = link.groups?.href;
        if (!href || !WDRPageIE._PAGE_REGEX.test(href)) continue;
        entries.push(this.url_result(urljoin(url, href), 'WDR:page'));
      }
    }

    return this.playlist_result(entries, displayId);
  }
}

export class WDRElefantIE extends InfoExtractor {
  static IE_NAME = 'WDR:elefant';
  static _VALID_URL = /https?:\/\/(?:www\.)wdrmaus\.de\/elefantenseite\/#(?<id>.+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);

    const tableOfContents = await this._download_json<Record<string, Record<string, unknown>>>(
      'https://www.wdrmaus.de/elefantenseite/data/tableOfContentsJS.php5',
      displayId,
    );
    if (!(displayId in tableOfContents)) {
      throw new ExtractorError(
        "No entry in site's table of contents for this URL. Is the fragment part of the URL (after the #) correct?",
        { expected: true },
      );
    }
    const xmlMetadataPath = String(tableOfContents[displayId]!.xmlPath);
    const xmlMetadata = await this._download_webpage(
      `https://www.wdrmaus.de/elefantenseite/${xmlMetadataPath}`,
      displayId,
    );
    const zmdbUrl = xmlChildText(
      xmlMetadata.match(/<movie>([\s\S]*?)<\/movie>/i)?.[1] || '',
      'zmdb_url',
    );
    if (!zmdbUrl) {
      throw new ExtractorError(`${displayId} is not a video`, { expected: true });
    }
    return this.url_result(zmdbUrl, 'WDR');
  }
}
