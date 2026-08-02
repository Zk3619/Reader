/** Opencast family — ported from yt-dlp opencast.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, traverse_obj } from '../../utils';
import { parseIso8601 } from './_helpers';

const INSTANCES_RE = String.raw`(?:opencast\.informatik\.kit\.edu|electures\.uni-muenster\.de|oc-presentation\.ltcc\.tuwien\.ac\.at|medien\.ph-noe\.ac\.at|oc-video\.ruhr-uni-bochum\.de|oc-video1\.ruhr-uni-bochum\.de|opencast\.informatik\.uni-goettingen\.de|heicast\.uni-heidelberg\.de|opencast\.hawk\.de:8080|opencast\.hs-osnabrueck\.de|video[0-9]+\.virtuos\.uni-osnabrueck\.de|opencast\.uni-koeln\.de|media\.opencast\.hochschule-rhein-waal\.de|matterhorn\.dce\.harvard\.edu|hs-harz\.opencast\.uni-halle\.de|videocampus\.urz\.uni-leipzig\.de|media\.uct\.ac\.za|vid\.igb\.illinois\.edu|cursosabertos\.c3sl\.ufpr\.br|mcmedia\.missioncollege\.org|clases\.odon\.edu\.uy|oc-p\.uni-jena\.de)`;
const UUID_RE = String.raw`[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}`;

function variadic<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export class OpencastBaseIE extends InfoExtractor {
  static IE_NAME = 'opencastbase';
  static _VALID_URL: RegExp | string | false | null = false;
  protected _API_BASE = 'https://%s/search/episode.json?id=%s';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('OpencastBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(host: string, videoId: string, sid = false): Promise<Record<string, unknown>> {
    const apiUrl = sid
      ? `https://${host}/search/episode.json?sid=${videoId}`
      : `https://${host}/search/episode.json?id=${videoId}`;
    return this._download_json<Record<string, unknown>>(apiUrl, videoId);
  }

  protected async _parseMediapackage(video: Record<string, unknown>): Promise<VideoInfo> {
    const videoId = video.id as string | undefined;
    if (!videoId) throw new ExtractorError('Video id was not found', { expected: true });

    const formats: Format[] = [];
    const tracks = variadic(traverse_obj(video, ["media", "track"]) as Format[] | Format | undefined);
    for (const track of tracks as Array<Record<string, unknown>>) {
      const href = track.url as string | undefined;
      if (!href) continue;
      const ext = determine_ext(href);
      const transport = track.transport as string | undefined;

      if (transport === 'DASH' || ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(href, videoId, 'dash', undefined, false)));
      } else if (transport === 'HLS' || ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            href,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
          )),
        );
      } else if (transport === 'HDS' || ext === 'f4m' || transport === 'SMOOTH' || ext === 'smil') {
        /* f4m/ism/smil skipped in TS port */
      } else {
        const videoMeta = (track.video as Record<string, unknown>) || {};
        const audioMeta = (track.audio as Record<string, unknown>) || {};
        const trackObj: Format = {
          url: href,
          format_id: transport || ext || 'http',
          ext: ext !== 'unknown' ? ext : undefined,
          format_note: transport,
          fps: int_or_none(videoMeta.framerate) ?? undefined,
          vbr: int_or_none(videoMeta.bitrate, 1000) ?? undefined,
          vcodec: track.video ? String(traverse_obj(videoMeta, ["encoder", "type"]) ?? '') : 'none',
          abr: int_or_none(audioMeta.bitrate, 1000) ?? undefined,
          acodec: track.audio ? String(traverse_obj(audioMeta, ["encoder", "type"]) ?? '') : 'none',
        };
        if (transport === 'RTMP') {
          const rm = href.match(/(?:rtmp:\/\/[^/]+\/(?<app>[^/]+))\/(?<ext>.+):(?<playpath>.+)/);
          if (rm?.groups) {
            trackObj.app = rm.groups.app;
            trackObj.ext = rm.groups.ext;
            trackObj.play_path = `${rm.groups.ext}:${rm.groups.playpath}`;
            trackObj.rtmp_live = true;
            trackObj.preference = -2;
          } else continue;
        }
        formats.push(trackObj);
      }
    }

    const attachments = variadic(traverse_obj(video, ["attachments", "attachment"]) as unknown);
    const thumbUrl = (attachments[0] as Record<string, unknown> | undefined)?.url as string | undefined;

    return {
      id: videoId,
      formats,
      title: video.title as string | undefined,
      series: video.seriestitle as string | undefined,
      season_id: video.series as string | undefined,
      creator: traverse_obj(video, ["creators", "creator"]) as string | undefined,
      timestamp: parseIso8601(video.start) ?? undefined,
      thumbnail: thumbUrl,
    };
  }
}

export class OpencastIE extends OpencastBaseIE {
  static IE_NAME = 'opencast';
  static _VALID_URL = new RegExp(
    String.raw`https?:\/\/(?<host>${INSTANCES_RE})\/paella[0-9]*\/ui\/watch\.html\?(?:[^#]+&)?id=(?<id>${UUID_RE})`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const host = m.groups!.host!;
    const videoId = m.groups!.id!;
    const response = await this._callApi(host, videoId);
    const pkg =
      (traverse_obj(response, ["search-results", "result"]) as Record<string, unknown> | undefined) ||
      ((traverse_obj(response, ['result']) as Array<Record<string, unknown>> | undefined)?.find(Boolean)?.mediapackage as
        | Record<string, unknown>
        | undefined) ||
      {};
    return this._parseMediapackage(pkg);
  }
}

export class OpencastPlaylistIE extends OpencastBaseIE {
  static IE_NAME = 'opencast:playlist';
  static _VALID_URL = new RegExp(
    String.raw`https?:\/\/(?<host>${INSTANCES_RE})(?:\/engage\/ui\/index\.html\?(?:[^#]+&)?epFrom=|\/ltitools\/index\.html\?(?:[^#]+&)?series=)(?<id>${UUID_RE})`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const host = m.groups!.host!;
    const videoId = m.groups!.id!;
    const response = await this._callApi(host, videoId, true);
    const results = variadic(
      traverse_obj(response, ["search-results", "result"]) as Record<string, unknown> | Array<Record<string, unknown>>,
    );
    const entries: VideoInfo[] = [];
    for (const episode of results) {
      const pkg = episode.mediapackage as Record<string, unknown> | undefined;
      if (pkg) entries.push(await this._parseMediapackage(pkg));
    }
    const seriesTitle = entries[0]?.series;
    return this.playlist_result(
      entries,
      videoId,
      typeof seriesTitle === 'string' ? seriesTitle : undefined,
    );
  }
}
