/** On24IE — ported from yt-dlp on24.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj } from '../../utils';
import { urljoin } from './_helpers';

const ID_RE = String.raw`(?<id>\d{7})`;
const KEY_RE = String.raw`(?<key>[0-9A-F]{32})`;
const URL_BASE_RE = String.raw`https?:\/\/event\.on24\.com`;
const URL_QUERY_RE = String.raw`(?:[^#]*&)?eventid=${ID_RE}&(?:[^#]+&)?key=${KEY_RE}`;

export class On24IE extends InfoExtractor {
  static IE_NAME = 'on24';
  static _VALID_URL = [
    new RegExp(`${URL_BASE_RE}/wcc/r/${ID_RE}/${KEY_RE}`),
    new RegExp(
      `${URL_BASE_RE}/eventRegistration/console/(?:EventConsoleApollo\\.jsp|apollox/mainEvent/?)\?${URL_QUERY_RE}`,
    ),
    new RegExp(`${URL_BASE_RE}/eventRegistration/EventLobbyServlet/?\\?${URL_QUERY_RE}`),
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let eventId = m.groups!.id!;
    const eventKey = m.groups!.key!;

    const eventData = await this._download_json<Record<string, unknown>>(
      'https://event.on24.com/apic/utilApp/EventConsoleCachedServlet',
      eventId,
      undefined,
      {
        query: {
          eventId,
          displayProfile: 'player',
          key: eventKey,
          contentType: 'A',
        },
      },
    );

    eventId =
      String(traverse_obj(eventData, ["presentationLogInfo", "eventid"]) ?? '') || eventId;
    const language = eventData.localelanguagecode as string | undefined;

    const formats: NonNullable<VideoInfo['formats']> = [];
    for (const media of (eventData.mediaUrlInfo as Array<Record<string, unknown>>) || []) {
      const mediaUrl = urljoin(
        'https://event.on24.com/media/news/corporatevideo/events/',
        String(media.url ?? ''),
      );
      if (!mediaUrl) continue;
      const mediaType = media.code as string | undefined;
      if (mediaType === 'fhvideo1') {
        formats.push({
          format_id: 'video',
          url: mediaUrl,
          language,
          ext: 'mp4',
          vcodec: 'avc1.640020',
          acodec: 'mp4a.40.2',
        });
      } else if (mediaType === 'audio') {
        formats.push({
          format_id: 'audio',
          url: mediaUrl,
          language,
          ext: 'wav',
          vcodec: 'none',
          acodec: 'wav',
        });
      }
    }

    return {
      id: eventId,
      title: str_or_none(eventData.description) ?? undefined,
      timestamp: int_or_none(traverse_obj(eventData, ["session", "startdate"]), 1000) ?? undefined,
      webpage_url: `https://event.on24.com/wcc/r/${eventId}/${eventKey}`,
      view_count: eventData.registrantcount as number | undefined,
      formats,
    };
  }
}
