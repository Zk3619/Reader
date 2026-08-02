/**
 * CiscoWebexIE — ported from yt-dlp ciscowebex.py
 * (Redirect-chasing for `ldr`/`lsr` short URLs is simplified: the redirect
 * target is located by re-matching _VALID_URL against the downloaded page.)
 */

import { ExtractorError, InfoExtractor, NO_DEFAULT } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, unified_timestamp } from '../../utils';

export class CiscoWebexIE extends InfoExtractor {
  static IE_NAME = 'ciscowebex';
  static IE_DESC = 'Cisco Webex';
  static _VALID_URL =
    /(?<url>https?:\/\/(?<subdomain>[^/#?]*)\.webex\.com\/(?:(?<siteurl_1>[^/#?]*)\/(?:ldr|lsr)\.php\?(?:[^#]*&)*RCID=(?<rcid>[0-9a-f]{32})|(?:recordingservice|webappng)\/sites\/(?<siteurl_2>[^/#?]*)\/recording\/(?:playback\/|play\/)?(?<id>[0-9a-f]{32})))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    let m = this._match_valid_url(url)!;
    if (m.groups!.rcid) {
      const webpage = await this._download_webpage(url, undefined, 'Getting video ID');
      const redirected = this._search_regex(CiscoWebexIE._VALID_URL, webpage, 'redirection url', NO_DEFAULT, true, 'url')!;
      m = this._match_valid_url(redirected)!;
    }
    const subdomain = m.groups!.subdomain!;
    const siteurl = m.groups!.siteurl_1 || m.groups!.siteurl_2!;
    let videoId = m.groups!.id!;

    const password = this.params.videopassword as string | undefined;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (password) headers.accessPwd = password;

    let stream: Record<string, unknown>;
    try {
      stream = await this._download_json(`https://${subdomain}.webex.com/webappng/api/v1/recordings/${videoId}/stream`, videoId, undefined, {
        headers,
        query: { siteurl },
      });
    } catch (e) {
      throw new ExtractorError(`Unable to fetch recording stream info: ${(e as Error).message}`, { cause: e });
    }

    if (stream.code === 53004) this.raise_login_required();
    if (stream.code === 53005) {
      if (password) throw new ExtractorError('Wrong password', { expected: true });
      throw new ExtractorError('This video is protected by a password, use the --video-password option', {
        expected: true,
      });
    }
    if (!stream.fallbackPlaySrc && stream.message) {
      throw new ExtractorError(`${this.IE_NAME} said: ${stream.code} - ${stream.message}`, { expected: true });
    }

    videoId = (stream.recordUUID as string) || videoId;

    const formats: Format[] = [
      { format_id: 'video', url: stream.fallbackPlaySrc as string, ext: 'mp4', vcodec: 'avc1.640028', acodec: 'mp4a.40.2' },
    ];
    if (stream.preventDownload === false) {
      const downloadInfo = (stream.downloadRecordingInfo as Record<string, unknown> | undefined)?.downloadInfo as
        | Record<string, unknown>
        | undefined;
      const mp4Url = downloadInfo?.mp4URL as string | undefined;
      if (mp4Url) {
        formats.push({ format_id: 'video', url: mp4Url, ext: 'mp4', vcodec: 'avc1.640028', acodec: 'mp4a.40.2' });
      }
      const audioUrl = downloadInfo?.audioURL as string | undefined;
      if (audioUrl) {
        formats.push({ format_id: 'audio', url: audioUrl, ext: 'mp3', vcodec: 'none', acodec: 'mp3' });
      }
    }

    return {
      id: videoId,
      title: stream.recordName as string,
      description: (stream.description as string) || undefined,
      uploader: (stream.ownerDisplayName as string) || undefined,
      uploader_id: (stream.ownerUserName as string) || (stream.ownerId as string) || undefined,
      timestamp: unified_timestamp(stream.createTime) ?? undefined,
      duration: int_or_none(stream.duration, 1000) ?? undefined,
      webpage_url: `https://${subdomain}.webex.com/recordingservice/sites/${siteurl}/recording/playback/${videoId}`,
      formats,
    };
  }
}
