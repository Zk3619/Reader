/**
 * DigitallySpeakingIE — ported from yt-dlp dispeak.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_duration, remove_end } from '../../utils';
import { xmlTagText } from './_helpers';

export class DigitallySpeakingIE extends InfoExtractor {
  static IE_NAME = 'digitallyspeaking';
  static _VALID_URL =
    /https?:\/\/(?:s?evt\.dispeak|events\.digitallyspeaking)\.com\/(?:[^/]+\/)+xml\/(?<id>[^.]+)\.xml/;

  private _parseMp4(metadata: string): Format[] | null {
    let videoRoot: string | null = null;
    const mp4Video = xmlTagText(metadata, 'mp4video');
    if (mp4Video) {
      const mobj = /^((?:https?:\/\/.*?\/)).*/.exec(mp4Video);
      videoRoot = mobj?.[1] ?? null;
    }
    if (!videoRoot) {
      const httpHost = xmlTagText(metadata, 'httpHost');
      if (httpHost) videoRoot = `http://${httpHost}/`;
    }
    if (!videoRoot) videoRoot = 'http://s3-2u.digitallyspeaking.com/';

    const formatBlocks = [...metadata.matchAll(/<MBRVideo\b[^>]*>([\s\S]*?)<\/MBRVideo>/gi)];
    if (!formatBlocks.length) return null;

    const videoFormats: Format[] = [];
    for (const block of formatBlocks) {
      const body = block[1] || '';
      const streamName = xmlTagText(body, 'streamName');
      if (!streamName) continue;
      const pathMatch = /^mp4:(?<path>.*)/.exec(streamName);
      if (!pathMatch?.groups?.path) continue;
      const videoPath = pathMatch.groups.path;
      const url = videoRoot + videoPath;
      const bitrate = xmlTagText(body, 'bitrate') || undefined;
      const tbr = int_or_none(bitrate) ?? undefined;
      const vbrMatch = /-(\d+)\.mp4/.exec(videoPath);
      videoFormats.push({
        format_id: bitrate || 'mp4',
        url,
        tbr,
        vbr: int_or_none(vbrMatch?.[1]) ?? undefined,
      });
    }
    return videoFormats;
  }

  private _parseFlv(metadata: string): Format[] {
    const formats: Format[] = [];
    const akamaiUrl = xmlTagText(metadata, 'akamaiHost');
    if (!akamaiUrl) return formats;

    for (const audioMatch of metadata.matchAll(/<audio\b([^>]*)>/gi)) {
      const attrs = audioMatch[1] || '';
      const audioUrl = /url="([^"]+)"/.exec(attrs)?.[1];
      const code = /code="([^"]+)"/.exec(attrs)?.[1];
      if (!audioUrl) continue;
      formats.push({
        url: `rtmp://${akamaiUrl}/ondemand?ovpfv=1.1`,
        play_path: remove_end(audioUrl, '.flv') || undefined,
        ext: 'flv',
        vcodec: 'none',
        quality: 1,
        format_id: code || 'audio',
      });
    }

    for (const [videoKey, formatId, preference] of [
      ['slide', 'slides', -2],
      ['speaker', 'speaker', -1],
    ] as const) {
      const videoPath = xmlTagText(metadata, `${videoKey}Video`);
      if (!videoPath) continue;
      formats.push({
        url: `rtmp://${akamaiUrl}/ondemand?ovpfv=1.1`,
        play_path: remove_end(videoPath, '.flv') || undefined,
        ext: 'flv',
        format_note: `${videoKey} video`,
        quality: preference,
        format_id: formatId,
      });
    }
    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const xmlDescription = await this._download_webpage(url, videoId);
    const metadataMatch = /<metadata\b[^>]*>([\s\S]*?)<\/metadata>/i.exec(xmlDescription);
    const metadata = metadataMatch?.[1] || xmlDescription;

    let videoFormats = this._parseMp4(metadata);
    if (!videoFormats) videoFormats = this._parseFlv(metadata);

    return {
      id: videoId,
      formats: videoFormats || [],
      title: xmlTagText(metadata, 'title') || videoId,
      duration: parse_duration(xmlTagText(metadata, 'endTime')) ?? undefined,
      creator: xmlTagText(metadata, 'speaker') ?? undefined,
    };
  }
}
