/**
 * CBS family — ported from yt-dlp cbs.py
 *
 * Notes on pragmatic simplifications vs. upstream:
 * - Upstream `CBSIE`/`CBSBaseIE` build on `ThePlatformFeedIE`'s full SMIL-parsing machinery
 *   (multi-`<switch>` bitrate ladders, RTMP `<param>` reconstruction, theplatform preview JSON
 *   metadata). No XML DOM or theplatform helper is available in this runtime, so
 *   `_extractCommonVideoInfo` does a lightweight regex scan of the SMIL response for
 *   `<video src="...">` / `<ref src="...">` leaf URLs (treating `.m3u8` targets as HLS) and
 *   `<param name="...CaptionURL" value="...">` for subtitles — mirrors the regex-XML approach
 *   used in hand-b/bbc.ts for the legacy iPlayer playlist feed.
 * - `CBSIE` is marked `_WORKING = false` upstream (site access requires a US-region
 *   subscription); the port keeps the same main-path shape for parity but is unlikely to be
 *   exercised.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { extract_attributes, int_or_none, smuggle_url, update_url_query, url_or_none } from '../../utils';

function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?/>|<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, 'gi');
  return xml.match(re) || [];
}

function xmlOpenTagAttrs(block: string): string {
  const m = block.match(/^<[a-zA-Z0-9]+((?:\s+[^>]*)?)\/?>/);
  return m ? m[1] || '' : '';
}

function xmlAttr(block: string, attr: string): string | null {
  const m = xmlOpenTagAttrs(block).match(new RegExp(`\\b${attr}="([^"]*)"`, 'i'));
  return m ? m[1]! : null;
}

function xmlTagText(xml: string, tag: string): string | null {
  const block = xmlBlocks(xml, tag)[0];
  if (!block) return null;
  const m = block.match(/>([\s\S]*)<\/[a-zA-Z0-9]+>$/);
  return m ? m[1]!.trim() || null : null;
}

/** XXX: Do not subclass from a concrete IE (kept for parity with upstream CBSBaseIE). */
export class CBSBaseIE extends InfoExtractor {
  static IE_NAME = 'cbsbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  protected _parseSmilSubtitles(smil: string, subtitlesLang = 'en'): Record<string, Subtitle[]> {
    const subtitles: Record<string, Subtitle[]> = {};
    const KEY_EXT: Array<[string, string]> = [
      ['sMPTE-TTCCURL', 'tt'],
      ['ClosedCaptionURL', 'ttml'],
      ['webVTTCaptionURL', 'vtt'],
    ];
    for (const block of xmlBlocks(smil, 'param')) {
      const name = xmlAttr(block, 'name');
      const found = KEY_EXT.find(([k]) => k === name);
      if (!found) continue;
      const ccUrl = xmlAttr(block, 'value');
      if (!ccUrl) continue;
      if (!subtitles[subtitlesLang]) subtitles[subtitlesLang] = [];
      subtitles[subtitlesLang]!.push({ ext: found[1], url: ccUrl });
    }
    return subtitles;
  }

  protected async _extractTheplatformSmil(
    smilUrl: string,
    contentId: string,
    note: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const smil = await this._download_webpage(smilUrl, contentId, note);
    const formats: Format[] = [];
    const seen = new Set<string>();
    for (const tag of ['video', 'ref', 'audio']) {
      for (const block of xmlBlocks(smil, tag)) {
        const src = xmlAttr(block, 'src');
        if (!src || seen.has(src)) continue;
        seen.add(src);
        if (src.includes('.m3u8')) {
          formats.push(
            ...(await this._extract_m3u8_formats(src, contentId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
          );
        } else if (src.includes('.mpd')) {
          formats.push(...(await this._extract_mpd_formats(src, contentId, 'dash', undefined, false)));
        } else if (/^rtmps?:\/\//i.test(src)) {
          continue; // RTMP reconstruction requires the SMIL <switch>/<param> ladder; skip.
        } else {
          formats.push(
            this._create_format(src, {
              format_id: tag,
              width: int_or_none(xmlAttr(block, 'width')) ?? undefined,
              height: int_or_none(xmlAttr(block, 'height')) ?? undefined,
              tbr: int_or_none(xmlAttr(block, 'system-bitrate'), 1000) ?? undefined,
              vcodec: tag === 'audio' ? 'none' : undefined,
            }),
          );
        }
      }
    }
    if (!formats.length) throw new ExtractorError(`Unable to extract formats from SMIL: ${smilUrl}`);
    return { formats, subtitles: this._parseSmilSubtitles(smil) };
  }

  protected async _extractCommonVideoInfo(
    contentId: string,
    assetTypes: Record<string, Record<string, string>>,
    mpxAcc: number,
    extraInfo: Record<string, unknown>,
  ): Promise<VideoInfo> {
    const tpPath = `dJ5BDC/media/guid/${mpxAcc}/${contentId}`;
    const tpReleaseUrl = `https://link.theplatform.com/s/${tpPath}`;

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    let lastError: Error | null = null;
    for (const [assetType, query] of Object.entries(assetTypes)) {
      try {
        const res = await this._extractTheplatformSmil(
          update_url_query(tpReleaseUrl, query),
          contentId,
          `Downloading ${assetType} SMIL data`,
        );
        formats.push(...res.formats);
        for (const [lang, subs] of Object.entries(res.subtitles)) {
          if (!subtitles[lang]) subtitles[lang] = [];
          subtitles[lang]!.push(...subs);
        }
      } catch (e) {
        lastError = e as Error;
        continue;
      }
    }
    if (lastError && !formats.length) {
      this.raise_no_formats(lastError.message, true);
    }

    const info: Record<string, unknown> = { id: contentId, formats, subtitles };
    for (const [k, v] of Object.entries(extraInfo)) if (v != null) info[k] = v;
    return info as unknown as VideoInfo;
  }

  protected async _extractVideoInfo(_contentId: string): Promise<VideoInfo> {
    throw new ExtractorError('This method must be implemented by subclasses');
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractVideoInfo(this._match_id(url));
  }
}

export class CBSIE extends CBSBaseIE {
  static IE_NAME = 'cbs';
  static _VALID_URL =
    /^(?:cbs:|https?:\/\/(?:www\.)?(?:cbs\.com\/(?:shows|movies)\/(?:video\/|[^/]+\/video\/|[^/]+\/)|colbertlateshow\.com\/(?:video|podcasts)\/))(?<id>[\w-]+)/;

  protected async _extractVideoInfo(
    contentId: string,
    site = 'cbs',
    mpxAcc = 2198311517,
  ): Promise<VideoInfo> {
    const xml = await this._download_webpage(
      'https://can.cbs.com/thunder/player/videoPlayerService.php',
      contentId,
      undefined,
      { query: { partner: site, contentId } },
    );
    const items = xmlBlocks(xml, 'item');
    const videoData = items[0] || '';
    const title = xmlTagText(videoData, 'videoTitle') || xmlTagText(videoData, 'videotitle');

    const assetTypes: Record<string, Record<string, string>> = {};
    let hasDrm = false;
    for (const item of items) {
      let assetType = xmlTagText(item, 'assetType') || '';
      const query: Record<string, string> = { mbr: 'true', assetTypes: assetType };
      if (!assetType) {
        assetType = 'fallback';
        query.formats = 'M3U+none,MPEG4,M3U+appleHlsEncryption,MP3';
        delete query.assetTypes;
      }
      if (assetTypes[assetType]) continue;
      if (['HLS_FPS', 'DASH_CENC', 'OnceURL'].some((excluded) => assetType.includes(excluded))) {
        if (assetType.includes('DASH_CENC')) hasDrm = true;
        continue;
      }
      if (assetType.startsWith('HLS') || assetType.includes('StreamPack')) {
        query.formats = 'MPEG4,M3U';
      } else if (['RTMP', 'WIFI', '3G'].includes(assetType)) {
        query.formats = 'MPEG4,FLV';
      }
      assetTypes[assetType] = query;
    }

    if (!Object.keys(assetTypes).length && hasDrm) {
      throw new ExtractorError('This video is DRM protected', { expected: true });
    }

    return this._extractCommonVideoInfo(contentId, assetTypes, mpxAcc, {
      title,
      series: xmlTagText(videoData, 'seriesTitle'),
      season_number: int_or_none(xmlTagText(videoData, 'seasonNumber')),
      episode_number: int_or_none(xmlTagText(videoData, 'episodeNumber')),
      duration: int_or_none(xmlTagText(videoData, 'videoLength'), 1000),
      thumbnail: url_or_none(xmlTagText(videoData, 'previewImageURL')),
    });
  }
}

export class ParamountPressExpressIE extends InfoExtractor {
  static IE_NAME = 'paramountpressexpress';
  static _VALID_URL =
    /^https?:\/\/(?:www\.)?paramountpressexpress\.com(?:\/[\w-]+)+\/(?<yt>yt-)?video\/?\?watch=(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const match = this._match_valid_url(url)!;
    const displayId = match.groups!.id!;
    const isYoutube = Boolean(match.groups!.yt);
    if (isYoutube) return this.url_result(displayId, 'Youtube');

    const webpage = await this._download_webpage(url, displayId);
    const videoId = this._search_regex(/\bvideo_id\s*=\s*["'](\d+)["']\s*,/, webpage, 'Brightcove ID');
    const token = this._search_regex(/\btoken\s*=\s*["']([\w.-]+)["']/, webpage, 'token');

    const playerTag = webpage.match(/<[a-zA-Z][a-zA-Z0-9]*[^>]*\bid=["']vcbrightcoveplayer["'][^>]*>/i);
    const player = playerTag ? extract_attributes(playerTag[0]) : {};
    const accountId = player['data-account'] || '6055873637001';
    const playerId = player['data-player'] || 'OtLKgXlO9F';
    const embed = player['data-embed'] || 'default';

    return this.url_result(
      smuggle_url(
        `https://players.brightcove.net/${accountId}/${playerId}_${embed}/index.html?videoId=${videoId}`,
        { token },
      ),
      'BrightcoveNew',
    );
  }
}
