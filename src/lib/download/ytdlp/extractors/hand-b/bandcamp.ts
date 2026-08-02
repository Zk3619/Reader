/**
 * BandcampIE / BandcampAlbumIE / BandcampWeeklyIE / BandcampUserIE
 * — aligned with yt-dlp bandcamp.py
 */

import { InfoExtractor, ExtractorError, NO_DEFAULT } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  extract_attributes,
  float_or_none,
  get_elements_by_class,
  int_or_none,
  parse_filesize,
  parse_qs,
  str_or_none,
  unified_timestamp,
  update_url_query,
  url_or_none,
} from '../../utils';
import { urljoin } from './_helpers';

function protoRelativeUrl(url: string, scheme = 'http:'): string {
  return url.startsWith('//') ? `${scheme}${url}` : url;
}

/** python str.partition(sep) */
function partition(s: string, sep: string): [string, string, string] {
  const idx = s.indexOf(sep);
  if (idx === -1) return [s, '', ''];
  return [s.slice(0, idx), sep, s.slice(idx + sep.length)];
}

function strftimeYmd(ts: number | null | undefined): string | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  const d = new Date(ts * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function joinNonEmpty(parts: Array<string | null | undefined>, delim = ', '): string | undefined {
  const filtered = parts.filter((p): p is string => typeof p === 'string' && p.length > 0);
  return filtered.length ? filtered.join(delim) : undefined;
}

/** Best-effort transform_source: extract the outermost `{...}` blob from a JSONP-ish response. */
async function fetchStatJson(
  ie: InfoExtractor,
  statUrl: string,
  trackId: string,
  note: string,
): Promise<Record<string, unknown> | null> {
  const text = await ie._download_webpage(statUrl, trackId, note, { fatal: false });
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0 || end < start) return null;
  return ie._parse_json<Record<string, unknown>>(text.slice(start, end + 1), trackId, null, false);
}

export class BandcampIE extends InfoExtractor {
  static IE_NAME = 'bandcamp';
  static _VALID_URL = /https?:\/\/(?<uploader>[^/]+)\.bandcamp\.com\/track\/(?<id>[^/?#&]+)/;

  /** yt-dlp BandcampIE._extract_data_attr */
  protected _extractDataAttr(
    webpage: string,
    attr = 'tralbum',
    fatal = true,
  ): Record<string, unknown> | null {
    const raw = this._html_search_regex(
      new RegExp(`data-${attr}=(["'])({.+?})\\1`, 's'),
      webpage,
      `${attr} data`,
      fatal ? NO_DEFAULT : null,
      fatal,
      2,
    );
    return this._parse_json<Record<string, unknown>>(raw, undefined, null, fatal);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const match = this._match_valid_url(url);
    const title = match?.groups?.id || this._match_id(url);
    const uploader = match?.groups?.uploader;

    const webpage = await this._download_webpage(url, title);
    const tralbum = this._extractDataAttr(webpage, 'tralbum') || {};
    let thumbnail = this._og_search_thumbnail(webpage);

    let trackId: string | null = null;
    let track: string | undefined;
    let trackNumber: number | null = null;
    let duration: number | null = null;

    const formats: Format[] = [];
    const trackInfoList = tralbum.trackinfo;
    const trackInfo =
      Array.isArray(trackInfoList) && trackInfoList.length
        ? (trackInfoList[0] as Record<string, unknown>)
        : null;
    if (trackInfo) {
      const file_ = trackInfo.file;
      if (file_ && typeof file_ === 'object') {
        for (const [formatId, formatUrlRaw] of Object.entries(file_ as Record<string, unknown>)) {
          const formatUrl = url_or_none(formatUrlRaw);
          if (!formatUrl) continue;
          const dashIdx = formatId.indexOf('-');
          const ext = dashIdx >= 0 ? formatId.slice(0, dashIdx) : formatId;
          const abrStr = dashIdx >= 0 ? formatId.slice(dashIdx + 1) : '';
          formats.push({
            format_id: formatId,
            url: protoRelativeUrl(formatUrl, 'http:'),
            ext,
            vcodec: 'none',
            acodec: ext,
            abr: int_or_none(abrStr) ?? undefined,
          });
        }
      }
      track = str_or_none(trackInfo.title) ?? undefined;
      trackId = str_or_none(trackInfo.track_id ?? trackInfo.id);
      trackNumber = int_or_none(trackInfo.track_num);
      duration = float_or_none(trackInfo.duration);
    }

    const embed = this._extractDataAttr(webpage, 'embed', false) || {};
    const current = (tralbum.current as Record<string, unknown>) || {};
    let artist = str_or_none(embed.artist ?? current.artist ?? tralbum.artist) ?? undefined;
    const albumArtist = this._html_search_regex(
      /<h3 class="albumTitle">[\S\s]*?by\s*<span>\s*<a href="[^>]+">\s*([^>]+?)\s*<\/a>/,
      webpage,
      'album artist',
      null,
      false,
    );
    const timestamp = unified_timestamp(current.publish_date ?? tralbum.album_publish_date);

    const downloadLink = str_or_none(tralbum.freeDownloadPage);
    if (downloadLink) {
      trackId = str_or_none(tralbum.id) ?? trackId;

      const downloadWebpage = await this._download_webpage(
        downloadLink,
        trackId || title,
        'Downloading free downloads page',
      );
      const blob = this._extractDataAttr(downloadWebpage, 'blob') || {};

      const digitalItems = blob.digital_items;
      const downloadItems = blob.download_items;
      const info =
        (Array.isArray(digitalItems) && digitalItems.length
          ? (digitalItems[0] as Record<string, unknown>)
          : null) ||
        (Array.isArray(downloadItems) && downloadItems.length
          ? (downloadItems[0] as Record<string, unknown>)
          : null);

      if (info) {
        const downloads = info.downloads;
        if (downloads && typeof downloads === 'object') {
          if (!track) track = str_or_none(info.title) ?? undefined;
          if (!artist) artist = str_or_none(info.artist) ?? undefined;
          if (!thumbnail) thumbnail = url_or_none(info.thumb_url);

          const downloadFormats: Record<string, string> = {};
          const downloadFormatsList = blob.download_formats;
          if (Array.isArray(downloadFormatsList)) {
            for (const f of downloadFormatsList as Record<string, unknown>[]) {
              const name = f?.name;
              const ext = f?.file_extension;
              if (typeof name === 'string' && typeof ext === 'string') {
                downloadFormats[name] = ext.replace(/^\.+/, '');
              }
            }
          }

          for (const [formatId0, fRaw] of Object.entries(downloads as Record<string, unknown>)) {
            const f = (fRaw || {}) as Record<string, unknown>;
            const formatUrl = str_or_none(f.url);
            if (!formatUrl) continue;
            // Stat URL generation algorithm reverse engineered from download_*_bundle_*.js
            const statUrl = update_url_query(formatUrl.replace('/download/', '/statdownload/'), {
              '.rand': String(Math.floor(Date.now() * Math.random())),
            });
            const formatId = str_or_none(f.encoding_name) || formatId0;
            const stat = await fetchStatJson(this, statUrl, trackId || title, `Downloading ${formatId} JSON`);
            if (!stat) continue;
            const retryUrl = url_or_none(stat.retry_url);
            if (!retryUrl) continue;
            formats.push({
              url: protoRelativeUrl(retryUrl, 'http:'),
              ext: downloadFormats[formatId] ?? undefined,
              format_id: formatId,
              format_note: str_or_none(f.description) ?? undefined,
              filesize: parse_filesize(f.size_mb) ?? undefined,
              vcodec: 'none',
              acodec: formatId.split('-')[0],
            });
          }
        }
      }
    }

    const fullTitle = artist ? `${artist} - ${track ?? ''}` : track;

    if (!duration) {
      duration = float_or_none(this._html_search_meta('duration', webpage, undefined, false));
    }

    const tags = get_elements_by_class('tag', webpage)
      .map((raw) => clean_html(raw))
      .filter((t): t is string => !!t);

    return {
      id: trackId || title,
      title: fullTitle,
      thumbnail: thumbnail || undefined,
      uploader: artist,
      uploader_id: uploader,
      uploader_url: uploader ? `https://${uploader}.bandcamp.com` : undefined,
      timestamp: timestamp ?? undefined,
      release_timestamp: unified_timestamp(tralbum.album_release_date) ?? undefined,
      duration: duration ?? undefined,
      track,
      track_number: trackNumber ?? undefined,
      track_id: trackId || undefined,
      artist,
      artists: artist ? [artist] : undefined,
      album: str_or_none(embed.album_title) ?? undefined,
      album_artist: albumArtist ?? undefined,
      album_artists: albumArtist ? [albumArtist] : undefined,
      formats,
      tags: tags.length ? tags : undefined,
    };
  }
}

// XXX: Do not subclass from concrete IE (kept for parity with upstream BandcampAlbumIE)
export class BandcampAlbumIE extends BandcampIE {
  static IE_NAME = 'Bandcamp:album';
  static _VALID_URL = /https?:\/\/(?:(?<subdomain>[^.]+)\.)?bandcamp\.com\/album\/(?<id>[^/?#&]+)/;

  static suitable(url: string): boolean {
    if (BandcampWeeklyIE.suitable(url) || BandcampIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const match = this._match_valid_url(url);
    const uploaderId = match?.groups?.subdomain;
    const albumId = match?.groups?.id;
    const playlistId = albumId || uploaderId || this._match_id(url);

    const webpage = await this._download_webpage(url, playlistId);
    const tralbum = this._extractDataAttr(webpage, 'tralbum') || {};
    const trackInfo = tralbum.trackinfo;
    if (!Array.isArray(trackInfo) || !trackInfo.length) {
      throw new ExtractorError("The page doesn't contain any tracks");
    }

    // Only tracks with duration info have songs
    const entries = (trackInfo as Record<string, unknown>[])
      .filter((t) => t?.duration)
      .map((t) =>
        this.url_result(
          urljoin(url, String(t.title_link || '')),
          'Bandcamp',
          str_or_none(t.track_id ?? t.id),
          str_or_none(t.title),
        ),
      );

    const current = (tralbum.current as Record<string, unknown>) || {};

    return {
      _type: 'playlist',
      uploader_id: uploaderId,
      id: playlistId,
      title: str_or_none(current.title) ?? undefined,
      description: str_or_none(current.about) ?? undefined,
      entries,
    };
  }
}

// XXX: Do not subclass from concrete IE (kept for parity with upstream BandcampWeeklyIE)
export class BandcampWeeklyIE extends BandcampIE {
  static IE_NAME = 'Bandcamp:weekly';
  static _VALID_URL = /https?:\/\/(?:www\.)?bandcamp\.com\/radio\/?\?(?:[^#]+&)?show=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const showId = this._match_id(url);
    const playerData = await this._download_json<Record<string, unknown>>(
      'https://bandcamp.com/api/player/2/player_data_web',
      showId,
      'Downloading radio show JSON',
      {
        method: 'POST',
        data: JSON.stringify({ item_id: Number(showId), item_type: 'radio' }),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    const showData = (playerData?.tracklist as Record<string, unknown>) || {};
    const audioData = (showData.compiledTrack as Record<string, unknown>) || {};

    const streamUrl = str_or_none(audioData.streamUrl) || '';
    const encParam = parse_qs(streamUrl).enc;
    const formatId = encParam && encParam.length ? encParam[encParam.length - 1] : undefined;
    const [encoding, , bitrateStr] = partition(formatId || '', '-');

    const seriesTitle = str_or_none(showData.subtitle) ?? undefined;
    const releaseTimestamp = unified_timestamp(showData.date);
    const imageId = showData.imageId;
    const thumbnail =
      imageId != null && imageId !== '' ? `https://f4.bcbits.com/img/${imageId}_0.jpg` : undefined;

    return {
      id: showId,
      episode_id: showId,
      episode: str_or_none(showData.title) ?? undefined,
      title: joinNonEmpty([seriesTitle, strftimeYmd(releaseTimestamp)]),
      series: seriesTitle,
      thumbnail,
      description: str_or_none(showData.description) ?? undefined,
      duration: float_or_none(audioData.duration) ?? undefined,
      release_timestamp: releaseTimestamp ?? undefined,
      formats: [
        {
          url: streamUrl,
          format_id: formatId || 'stream',
          ext: encoding || 'mp3',
          acodec: encoding || undefined,
          vcodec: 'none',
          abr: int_or_none(bitrateStr) ?? undefined,
        },
      ],
    };
  }
}

export class BandcampUserIE extends InfoExtractor {
  static IE_NAME = 'Bandcamp:user';
  static _VALID_URL = /https?:\/\/(?!www\.)(?<id>[^.]+)\.bandcamp\.com(?:\/music)?\/?(?:[#?]|$)/;

  private _yieldItems(webpage: string): string[] {
    const items: string[] = [];

    const liItems = [
      ...webpage.matchAll(/<li data-item-id=["'][^>]+>\s*<a href=["'](?![^"'/]*?\/merch)([^"']+)/g),
    ].map((m) => m[1]!);
    if (liItems.length) {
      items.push(...liItems);
    } else {
      items.push(
        ...[...webpage.matchAll(/<div[^>]+trackTitle["'][^"']+["']([^"']+)/g)].map((m) => m[1]!),
      );
    }

    const gridTag = webpage.match(/<[a-zA-Z][a-zA-Z0-9]*[^>]*\bid=["']music-grid["'][^>]*>/i);
    if (gridTag) {
      const attrs = extract_attributes(gridTag[0]);
      const raw = attrs['data-client-items'];
      if (raw) {
        try {
          const parsed = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'")) as Array<
            Record<string, unknown>
          >;
          for (const item of parsed) {
            const pageUrl = item?.page_url;
            if (typeof pageUrl === 'string') items.push(pageUrl);
          }
        } catch {
          /* ignore malformed data-client-items */
        }
      }
    }

    return items;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const uploader = this._match_id(url);
    const webpage = await this._download_webpage(url, uploader);

    const seen = new Set<string>();
    const entries = [];
    for (const item of this._yieldItems(webpage)) {
      const absolute = urljoin(url, item);
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      entries.push(this.url_result(absolute));
    }

    return this.playlist_result(entries, uploader, `Discography of ${uploader}`);
  }
}
