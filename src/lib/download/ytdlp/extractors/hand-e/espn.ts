/**
 * ESPN family — ported from yt-dlp espn.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext, int_or_none, unified_strdate, unified_timestamp } from '../../utils';
import { extractM3u8FormatsAndSubtitles, extractSmilMediaUrls, mergeSubtitles } from './_helpers';
import { isAwsWafChallengeHtml } from '../../utils/waf-challenge';

export class ESPNIE extends InfoExtractor {
  static IE_NAME = 'espn';
  static _VALID_URL =
    /https?:\/\/(?:(?:(?:(?:(?:\w+\.)+)?espn\.go|(?:www\.)?espn)\.com\/(?:(?:video\/(?:clip|iframe\/twitter))(?:.*?\?.*?\bid=|\/_\/id\/)|[^/]+\/video\/)|(?:www\.)espnfc\.(?:com|us)\/(?:video\/)?[^/]+\/\d+\/video\/))(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const clipResponse = await this._download_json<{ videos: Record<string, unknown>[] }>(
      `http://api-app.espn.com/v1/video/clips/${videoId}`,
      videoId,
    );
    const clip = clipResponse.videos[0]!;

    const formatUrls = new Set<string>();
    const formats: Format[] = [];

    const extractSource = async (sourceUrl: string, sourceId?: string) => {
      if (formatUrls.has(sourceUrl)) return;
      formatUrls.add(sourceUrl);
      const ext = determine_ext(sourceUrl);
      const fid = sourceId || 'http';
      if (ext === 'smil') {
        const smil = await this._download_webpage(sourceUrl, videoId, undefined, { fatal: false });
        for (const mediaUrl of extractSmilMediaUrls(smil)) {
          formats.push({ url: mediaUrl, format_id: fid });
        }
      } else if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            sourceUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            sourceId,
            undefined,
            false,
          )),
        );
      } else {
        const f: Format = { url: sourceUrl, format_id: fid };
        const mobj = sourceUrl.match(/(\d+)p(\d+)_(\d+)k\./);
        if (mobj) {
          f.height = Number(mobj[1]);
          f.fps = Number(mobj[2]);
          f.tbr = Number(mobj[3]);
        }
        if (sourceId === 'mezzanine') f.quality = 1;
        formats.push(f);
      }
    };

    const traverseSource = async (source: Record<string, unknown>, baseSourceId?: string) => {
      for (const [srcId, srcItem] of Object.entries(source)) {
        if (srcId === 'alert') continue;
        if (typeof srcItem === 'string') {
          await extractSource(srcItem, baseSourceId);
        } else if (srcItem && typeof srcItem === 'object') {
          await traverseSource(
            srcItem as Record<string, unknown>,
            baseSourceId ? `${baseSourceId}-${srcId}` : srcId,
          );
        }
      }
    };

    const links = (clip.links as Record<string, unknown>) || {};
    await traverseSource((links.source as Record<string, unknown>) || {});
    await traverseSource((links.mobile as Record<string, unknown>) || {});

    return {
      id: videoId,
      title: String(clip.headline ?? videoId),
      description: (clip.caption as string) || (clip.description as string) || undefined,
      thumbnail: (clip.thumbnail as string) || undefined,
      timestamp: unified_timestamp(clip.originalPublishDate) ?? undefined,
      duration: int_or_none(clip.duration) ?? undefined,
      formats,
    };
  }
}

export class ESPNArticleIE extends InfoExtractor {
  static IE_NAME = 'espn:article';
  static _VALID_URL = /https?:\/\/(?:espn\.go|(?:www\.)?espn)\.com\/(?:[^/]+\/)*(?<id>[^/]+)/;

  static suitable(url: string): boolean {
    // Must use super so `this` is ESPNArticleIE (InfoExtractor.suitable would ignore our _VALID_URL).
    if (ESPNIE.suitable(url) || WatchESPNIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const webpage = await this._download_webpage(url, articleId);
    if (isAwsWafChallengeHtml(webpage)) {
      throw new ExtractorError(
        'ESPN blocked the request with an AWS WAF challenge (HTTP 202). Open the page in the app browser or export cookies, then retry.',
        { expected: true },
      );
    }

    // Upstream: video-play-button data-id; modern pages also embed numeric clip ids in JSON / attrs.
    const embeddedId =
      this._search_regex(
        /class=(["']).*?video-play-button.*?\1[^>]+data-id=["'](?<id>\d+)/,
        webpage,
        'video id',
        null,
        false,
        'id',
      ) ||
      this._search_regex(
        /data-(?:id|video-id|videocid)=["'](\d{6,})["']/,
        webpage,
        'video id',
        null,
        false,
      ) ||
      this._search_regex(
        /"(?:videoId|clipId|mediaId)"\s*:\s*"?(\d{6,})"?/,
        webpage,
        'video id',
        null,
        false,
      ) ||
      this._search_regex(
        /espn\.go\.com\/video\/clip\?(?:[^"'#]*&)?id=(\d+)/i,
        webpage,
        'video id',
        null,
        false,
      );

    if (!embeddedId) {
      throw new ExtractorError('ESPN article has no embeddable video clip', { expected: true });
    }
    return this.url_result(`http://espn.go.com/video/clip?id=${embeddedId}`, 'ESPN');
  }
}

export class FiveThirtyEightIE extends InfoExtractor {
  static IE_NAME = 'fivethirtyeight';
  static _VALID_URL = /https?:\/\/(?:www\.)?fivethirtyeight\.com\/features\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const embedUrl = this._search_regex(
      /<iframe[^>]+src=["'](https?:\/\/fivethirtyeight\.abcnews\.go\.com\/video\/embed\/\d+\/\d+)/,
      webpage,
      'embed url',
    )!;
    return this.url_result(embedUrl, 'AbcNewsVideo');
  }
}

export class ESPNCricInfoIE extends InfoExtractor {
  static IE_NAME = 'espncricinfo';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?espncricinfo\.com\/(?:cricket-)?videos?\/[^#$&?/]+-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const dataJson = await this._download_json<{ video: Record<string, unknown> }>(
      `https://hs-consumer-api.espncricinfo.com/v1/pages/video/video-details?videoId=${videoId}`,
      videoId,
    );
    const video = dataJson.video;
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    const playbacks = (video.playbacks as Record<string, unknown>[]) || [];
    for (const item of playbacks) {
      if (item.type === 'HLS' && item.url) {
        const res = await extractM3u8FormatsAndSubtitles(this, String(item.url), videoId);
        formats.push(...res.formats);
        subtitles = mergeSubtitles(subtitles, res.subtitles);
      } else if (item.type === 'AUDIO' && item.url) {
        formats.push({ url: String(item.url), format_id: 'audio', vcodec: 'none' });
      }
    }
    return {
      id: videoId,
      title: (video.title as string) || undefined,
      description: (video.summary as string) || undefined,
      upload_date: unified_strdate(video.publishedAt ?? video.recordedAt) ?? undefined,
      duration: int_or_none(video.duration) ?? undefined,
      formats,
      subtitles,
    };
  }
}

export class WatchESPNIE extends InfoExtractor {
  static IE_NAME = 'watchespn';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?espn\.com\/(?:watch|espnplus)\/player\/_\/id\/(?<id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const cdnData = await this._download_json<Record<string, unknown>>(
      `https://watch-cdn.product.api.espn.com/api/product/v3/watchespn/web/playback/event?id=${videoId}`,
      videoId,
    );
    const videoData = (cdnData.playbackState as Record<string, unknown>) || {};
    const sourceId = String(videoData.sourceId ?? '');

    if (sourceId.includes('DTC')) {
      this.raise_login_required('ESPN+ subscription required (cookies)');
    }
    if (sourceId !== 'ESPN_FREE') {
      this.raise_login_required('TV Provider authentication required for this stream');
    }

    const asset = await this._download_json<{ stream: string }>(
      `https://watch.auth.api.espn.com/video/auth/media/${videoId}/asset?apikey=uiqlbgzdwuru14v627vdusswb`,
      videoId,
    );

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, asset.stream, videoId, 'hls');

    return {
      id: videoId,
      duration: int_or_none((cdnData.tracking as Record<string, unknown>)?.duration) ?? undefined,
      title: (videoData.name as string) || undefined,
      formats,
      subtitles,
      thumbnail: (videoData.posterHref as string) || undefined,
    };
  }
}
