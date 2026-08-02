/**
 * ThePlatformBaseIE / ThePlatformIE / ThePlatformFeedIE — ported from yt-dlp theplatform.py
 * AdobePass simplified — base extends InfoExtractor directly.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  mimetype2ext,
  parse_qs,
  str_or_none,
  traverse_obj,
  unsmuggle_url,
  update_url_query,
  url_or_none,
} from '../../utils';
import {
  extractSmilMediaUrls,
  signTheplatformUrl,
} from '../hand-a/_helpers';
import {
  extractM3u8FormatsAndSubtitles,
  mergeSubtitles,
  parse_age_limit,
} from './_helpers';

async function parseSmilFormats(
  ie: InfoExtractor,
  smilXml: string,
  smilUrl: string,
  videoId: string,
): Promise<Format[]> {
  const formats: Format[] = [];
  const baseMatch = /<meta[^>]+(?:base|httpBase)=["']([^"']+)["']/i.exec(smilXml);
  const base = baseMatch?.[1] || smilUrl;
  const seen = new Set<string>();

  const mediaRe = /<(?:video|audio|media)\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = mediaRe.exec(smilXml))) {
    const attrs = m[1]!;
    const src = /\bsrc=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const srcUrl = (src.startsWith('http') ? src : new URL(src, `${base}/`).toString()).trim();
    const ext = determine_ext(srcUrl, undefined);
    if (ext === 'm3u8') {
      const res = await extractM3u8FormatsAndSubtitles(ie, srcUrl, videoId, 'hls');
      formats.push(...res.formats);
    } else if (ext === 'mpd') {
      formats.push(...(await ie._extract_mpd_formats(srcUrl, videoId, 'dash', undefined, false)));
    } else if (srcUrl.startsWith('http')) {
      formats.push({ url: srcUrl, ext: ext !== 'unknown' ? ext : 'flv', format_id: ext !== 'unknown' ? ext : 'flv' });
    }
  }
  return formats;
}

function parseTheplatformMetadata(tpMetadata: Record<string, unknown>): Partial<VideoInfo> {
  const info: Partial<VideoInfo> = {
    title: str_or_none(tpMetadata.title) ?? undefined,
    episode: str_or_none(tpMetadata.title) ?? undefined,
    description: str_or_none(tpMetadata.description) ?? undefined,
    thumbnail: url_or_none(tpMetadata.defaultThumbnailUrl) ?? undefined,
    duration: float_or_none(tpMetadata.duration, 1000) ?? undefined,
    timestamp: float_or_none(tpMetadata.pubDate, 1000) ?? undefined,
    uploader: str_or_none(tpMetadata.billingCode) ?? undefined,
  };

  const captions = traverse_obj(tpMetadata, ['captions']) as Array<Record<string, unknown>> | undefined;
  const subtitles: Record<string, Subtitle[]> = {};
  for (const caption of captions || []) {
    const src = url_or_none(caption.src);
    if (!src) continue;
    const lang = str_or_none(caption.lang) || 'en';
    (subtitles[lang] ||= []).push({
      url: src,
      ext: mimetype2ext(str_or_none(caption.type)) || 'vtt',
    });
  }
  if (Object.keys(subtitles).length) info.subtitles = subtitles;

  const ratings = traverse_obj(tpMetadata, ['ratings']) as Array<Record<string, unknown>> | undefined;
  for (const r of ratings || []) {
    const age = parse_age_limit(str_or_none(r.rating));
    if (age != null) {
      info.age_limit = age;
      break;
    }
  }

  return info;
}

export class ThePlatformBaseIE extends InfoExtractor {
  static IE_NAME = 'theplatformbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  protected _TP_TLD = 'com';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ThePlatformBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractTheplatformSmil(
    smilUrl: string,
    videoId: string,
    note = 'Downloading SMIL data',
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const smilXml = await this._download_webpage(smilUrl, videoId, note, {
      query: { format: 'SMIL' },
      headers: this.geo_verification_headers(),
    });

    const errorSrc = /<smil:ref[^>]+src=["']([^"']+)["']/i.exec(smilXml)?.[1];
    if (errorSrc) {
      const exception = /name=["']exception["'][^>]+value=["']([^"']+)["']/i.exec(smilXml)?.[1];
      const abstract = /\babstract=["']([^"']+)["']/i.exec(smilXml)?.[1];
      if (exception === 'GeoLocationBlocked') {
        this.raise_geo_restricted(abstract);
      }
      if (errorSrc.startsWith(`http://link.theplatform.${this._TP_TLD}/s/errorFiles/Unavailable.`)) {
        throw new ExtractorError(abstract || 'Unavailable', { expected: true });
      }
    }

    const formats: Format[] = [];
    for (const mediaUrl of extractSmilMediaUrls(smilXml)) {
      if (determine_ext(mediaUrl) === 'm3u8') {
        const hdnea2 = this._get_cookies(mediaUrl).hdnea2;
        const finalUrl = hdnea2 ? update_url_query(mediaUrl, { hdnea3: hdnea2 }) : mediaUrl;
        const res = await extractM3u8FormatsAndSubtitles(this, finalUrl, videoId, 'hls');
        formats.push(...res.formats);
      } else {
        formats.push({ url: mediaUrl, ext: determine_ext(mediaUrl), format_id: determine_ext(mediaUrl) });
      }
    }

    if (!formats.length) {
      formats.push(...(await parseSmilFormats(this, smilXml, smilUrl, videoId)));
    }

    return { formats, subtitles: {} };
  }

  protected async _downloadTheplatformMetadata(
    path: string,
    videoId: string,
    fatal = true,
  ): Promise<Record<string, unknown>> {
    return (
      (await this._download_json(
        `https://link.theplatform.${this._TP_TLD}/s/${path}`,
        videoId,
        undefined,
        { fatal, query: { format: 'preview' } },
      )) || {}
    );
  }

  protected async _extractTheplatformMetadata(
    path: string,
    videoId: string,
  ): Promise<Partial<VideoInfo>> {
    const info = await this._downloadTheplatformMetadata(path, videoId);
    return parseTheplatformMetadata(info);
  }
}

export class ThePlatformIE extends ThePlatformBaseIE {
  static IE_NAME = 'theplatform';
  static _VALID_URL =
    /(?:https?:\/\/(?:link|player)\.theplatform\.com\/[sp]\/(?<provider_id>[^/]+)\/(?:(?:(?:[^/]+\/)+select\/)?(?<media>media\/(?:guid\/\d+\/)?)?|(?<config>(?:[^/?#]+\/(?:swf|config)|onsite)\/select\/))?|theplatform:)(?<id>[^/?&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const [cleanUrl, smuggledData] = unsmuggle_url(url, {});

    const m = this._match_valid_url(cleanUrl)!;
    const providerId = m.groups!.provider_id || 'dJ5BDC';
    const videoId = m.groups!.id!;
    let path = `${providerId}/`;
    if (m.groups!.media) path += m.groups!.media;
    path += videoId;

    const qsDict = parse_qs(cleanUrl);
    if (qsDict.guid?.[0]) {
      const webpage = await this._download_webpage(cleanUrl, videoId);
      const scripts = [...webpage.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((x) => x[1]!);
      let feedId: string | null = null;
      for (const script of scripts.reverse()) {
        const feedScript = await this._download_webpage(
          script.startsWith('//') ? `http:${script}` : script,
          videoId,
          'Downloading feed script',
        );
        feedId =
          this._search_regex(/defaultFeedId\s*:\s*"([^"]+)"/, feedScript, 'default feed id', undefined, false) ||
          null;
        if (feedId) break;
      }
      if (!feedId) throw new ExtractorError('Unable to find feed id');
      return this.url_result(
        `http://feed.theplatform.com/f/${providerId}/${feedId}?byGuid=${qsDict.guid[0]}`,
        'ThePlatformFeed',
        qsDict.guid[0],
      );
    }

    let smilUrl: string;
    if (smuggledData.force_smil_url) {
      smilUrl = cleanUrl;
    } else if (cleanUrl.includes('/guid/')) {
      const headers: Record<string, string> = {};
      if (smuggledData.source_url) headers.Referer = String(smuggledData.source_url);
      const webpage = await this._download_webpage(cleanUrl, videoId, undefined, { headers });
      smilUrl = this._search_regex(
        /<link[^>]+href=(["'])(?<url>.+?)\1[^>]+type=["']application\/smil\+xml/i,
        webpage,
        'smil url',
        'url',
      ) || '';
      path =
        this._search_regex(
          /link\.theplatform\.com\/s\/((?:[^/?#&]+\/)+[^/?#&]+)/,
          smilUrl,
          'path',
        ) || path;
      smilUrl += smilUrl.includes('?') ? '&formats=m3u,mpeg4' : '?formats=m3u,mpeg4';
    } else if (m.groups!.config) {
      let configUrl = `${cleanUrl}&form=json`;
      configUrl = configUrl.replace('swf/', 'config/').replace('onsite/', 'onsite/config/');
      const config = await this._download_json<Record<string, unknown>>(configUrl, videoId, 'Downloading config');
      const releaseUrl =
        str_or_none(config.releaseUrl) || `http://link.theplatform.com/s/${path}?mbr=true`;
      smilUrl = `${releaseUrl}&formats=MPEG4&manifest=f4m`;
    } else {
      smilUrl = `http://link.theplatform.com/s/${path}?mbr=true`;
    }

    const sig = smuggledData.sig as { key?: string; secret?: string } | undefined;
    if (sig?.key && sig?.secret) {
      smilUrl = await signTheplatformUrl(smilUrl, sig.key, sig.secret);
    }

    const { formats, subtitles } = await this._extractTheplatformSmil(smilUrl, videoId);

    if (!formats.some((f) => String(f.format_id || '').startsWith('hls'))) {
      const m3u8Url = cleanUrl.replace(/\?.*$/, '').replace(/#.*$/, '') + '?mbr=true&manifest=m3u';
      const res = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');
      if (res.formats.length) {
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      }
    }

    const ret = await this._extractTheplatformMetadata(path, videoId);
    const combinedSubtitles = mergeSubtitles(ret.subtitles || {}, subtitles);

    return {
      ...ret,
      id: videoId,
      formats,
      subtitles: Object.keys(combinedSubtitles).length ? combinedSubtitles : undefined,
    };
  }
}

export class ThePlatformFeedIE extends ThePlatformBaseIE {
  static IE_NAME = 'theplatform:feed';
  static _VALID_URL =
    /https?:\/\/feed\.theplatform\.com\/f\/(?<provider_id>[^/]+)\/(?<feed_id>[^?/]+)\?(?:[^&]+&)*(?<filter>by(?:Gui|I)d=(?<id>[^&]+))/;

  protected async _extractFeedInfo(
    providerId: string,
    feedId: string,
    filterQuery: string,
    videoId: string,
    accountId?: number | null,
  ): Promise<VideoInfo> {
    const realUrl = `https://feed.theplatform.com/f/${providerId}/${feedId}?form=json&${filterQuery}`;
    const payload = await this._download_json<{ entries: Array<Record<string, unknown>> }>(
      realUrl,
      videoId,
    );
    const entry = payload.entries[0]!;

    const mainSmilUrl = accountId
      ? `http://link.theplatform.com/s/${providerId}/media/guid/${accountId}/${entry.guid}`
      : str_or_none(entry['plmedia$publicUrl']);

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    let firstVideoId: string | undefined;
    let duration: number | undefined;
    const assetTypes: string[] = [];

    for (const item of (entry['media$content'] as Array<Record<string, unknown>>) || []) {
      const smilUrlItem = String(item['plfile$url'] || '');
      const curVideoId = ThePlatformIE._VALID_URL.exec(smilUrlItem)?.groups?.id || videoId;
      if (!firstVideoId) {
        firstVideoId = curVideoId;
        duration = float_or_none(item['plfile$duration']) ?? undefined;
      }
      const fileAssetTypes =
        (item['plfile$assetTypes'] as string[]) || parse_qs(smilUrlItem).assetTypes || [];
      for (const assetType of fileAssetTypes) {
        if (assetTypes.includes(assetType)) continue;
        assetTypes.push(assetType);
        const query = {
          mbr: 'true',
          formats: String(item['plfile$format'] || ''),
          assetTypes: assetType,
        };
        const smilTarget = update_url_query(String(mainSmilUrl || smilUrlItem), query);
        const cur = await this._extractTheplatformSmil(
          smilTarget,
          videoId,
          `Downloading SMIL data for ${assetType}`,
        );
        formats.push(...cur.formats);
        subtitles = mergeSubtitles(subtitles, cur.subtitles);
      }
    }

    const thumbnails: Thumbnail[] = ((entry['media$thumbnails'] as Array<Record<string, unknown>>) || []).map(
      (thumbnail) => ({
        url: String(thumbnail['plfile$url'] || ''),
        width: int_or_none(thumbnail['plfile$width']) ?? undefined,
        height: int_or_none(thumbnail['plfile$height']) ?? undefined,
      }),
    );

    const timestamp = int_or_none(entry['media$availableDate'], 1000) ?? undefined;
    const categories = ((entry['media$categories'] as Array<Record<string, unknown>>) || []).map((item) =>
      String(item['media$name'] || ''),
    );

    const ret = await this._extractTheplatformMetadata(`${providerId}/${firstVideoId}`, videoId);
    subtitles = mergeSubtitles(subtitles, ret.subtitles || {});

    return {
      ...ret,
      id: videoId,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      thumbnails,
      duration,
      timestamp,
      categories,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    return this._extractFeedInfo(
      m.groups!.provider_id!,
      m.groups!.feed_id!,
      m.groups!.filter!,
      m.groups!.id!,
    );
  }
}
