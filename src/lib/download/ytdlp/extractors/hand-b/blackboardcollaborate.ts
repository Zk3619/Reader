/**
 * BlackboardCollaborate{,Launch}IE — ported from yt-dlp blackboardcollaborate.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { float_or_none, int_or_none, mimetype2ext, parse_qs, url_or_none } from '../../utils';
import { jwtDecodePayload, parseIso8601 } from './_helpers';

export class BlackboardCollaborateIE extends InfoExtractor {
  static IE_NAME = 'blackboardcollaborate';
  static _VALID_URL =
    /https?:\/\/(?<region>[a-z]+)(?:-lti)?\.bbcollab\.com\/(?:collab\/ui\/session\/playback\/load|recording)\/(?<id>[^/?#]+)/;

  protected async _callApi(
    region: string,
    videoId: string,
    path?: string,
    token?: string,
    note?: string,
    fatal = false,
  ): Promise<Record<string, unknown>> {
    let apiUrl = `https://${region}.bbcollab.com/collab/api/csa/recordings/${videoId}`;
    if (path) apiUrl += `/${path}`;
    return this._download_json(apiUrl, videoId, note || 'Downloading JSON metadata', {
      fatal,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const region = m.groups!.region!;
    const videoId = m.groups!.id!;
    const qs = parse_qs(url);
    const token = qs.authToken?.[qs.authToken.length - 1];

    let videoInfo = await this._callApi(region, videoId, 'data/secure', token, 'Trying auth token');
    let videoExtra: Record<string, unknown> = {};
    if (videoInfo && Object.keys(videoInfo).length) {
      videoExtra = await this._callApi(region, videoId, undefined, token, 'Retrieving extra attributes');
    } else {
      videoInfo = await this._callApi(region, videoId, 'data', undefined, 'Trying fallback', true);
    }

    const formats = ((videoInfo.extStreams as Array<Record<string, unknown>>) || [])
      .filter((v) => url_or_none(v.streamUrl))
      .map((v) => ({
        format_id: 'stream',
        url: v.streamUrl as string,
        ext: mimetype2ext(v.contentType as string) || undefined,
        aspect_ratio: float_or_none(v.aspectRatio) ?? undefined,
      }));

    const filesize = int_or_none(videoExtra.storageSize);
    if (filesize) for (const fmt of formats) (fmt as Record<string, unknown>).filesize = filesize;

    const subtitles: Record<string, Subtitle[]> = {};
    for (const subs of (videoInfo.subtitles as Array<Record<string, unknown>>) || []) {
      const subUrl = url_or_none(subs.url);
      if (!subUrl) continue;
      const lang = (subs.lang as string) || 'und';
      (subtitles[lang] ||= []).push({ ext: 'vtt', name: (subs.label as string) || undefined, url: subUrl });
    }
    for (const chat of (videoInfo.chats as Array<Record<string, unknown>>) || []) {
      const chatUrl = url_or_none(chat.url);
      if (!chatUrl) continue;
      (subtitles.live_chat ||= []).push({ ext: 'json', url: chatUrl });
    }

    return {
      id: videoId,
      title: (videoInfo.name as string) || undefined,
      timestamp: parseIso8601(videoInfo.created) ?? undefined,
      duration: int_or_none(videoInfo.duration, 1000) ?? undefined,
      formats,
      subtitles,
    };
  }
}

export class BlackboardCollaborateLaunchIE extends InfoExtractor {
  static IE_NAME = 'blackboardcollaborate:launch';
  static _VALID_URL = /https?:\/\/[a-z]+\.bbcollab\.com\/launch\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const token = this._match_id(url);
    let videoId = token;
    try {
      const payload = jwtDecodePayload(token);
      const ticket = payload.resourceAccessTicket as Record<string, unknown> | undefined;
      videoId = (ticket?.resourceId as string) || token;
    } catch {
      /* ignore malformed token */
    }

    const resp = await this._request_webpage(url, videoId);
    const redirectUrl = resp?.url || url;
    if (this.suitable(redirectUrl)) {
      throw new ExtractorError(`Unsupported URL: ${redirectUrl}`, { expected: true });
    }
    return this.url_result(redirectUrl, 'BlackboardCollaborate', videoId);
  }
}
