/** MediasiteIE / MediasiteCatalogIE / MediasiteNamedCatalogIE — ported from yt-dlp mediasite.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { float_or_none, mimetype2ext, str_or_none, unsmuggle_url, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, extractMpdFormatsAndSubtitles, urljoin } from './_helpers';

const ID_RE = '(?:[0-9a-f]{32,34}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12,14})';

const STREAM_TYPES: Record<number, string> = {
  0: 'video1',
  2: 'slide',
  3: 'presentation',
  4: 'video2',
  5: 'video3',
};

export class MediasiteIE extends InfoExtractor {
  static IE_NAME = 'mediasite';
  static _VALID_URL = new RegExp(
    String.raw`https?:\/\/[^/]+\/Mediasite\/(?:Play|Showcase\/[^/#?]+\/Presentation)\/(?<id>${ID_RE})(?<query>\?[^#]+|)`,
    'i',
  );
  static _EMBED_REGEX = [
    new RegExp(
      String.raw`<iframe\b[^>]+\bsrc=(["'])(?<url>(?:(?:https?:)?\/\/[^/]+)?\/Mediasite\/Play\/${ID_RE}(?:\?.*?)?)\1`,
      'i',
    ),
  ];

  protected _extractSlides(opts: {
    streamId: string;
    snum: number;
    stream: Record<string, unknown>;
    duration?: number;
    images: Record<string, unknown>;
  }): Format {
    const { streamId, snum, stream, duration, images } = opts;
    const slideBaseUrl = String(stream.SlideBaseUrl ?? '');
    let fnameTemplate = String(stream.SlideImageFileNameTemplate ?? 'slide_{0:D4}.jpg');
    fnameTemplate = fnameTemplate.replace(/\{0:D([0-9]+)\}/, '{0:0$1}');
    const slides = (stream.Slides as Array<Record<string, unknown>>) || [];
    const fragments: Array<{ path: string; duration: number }> = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]!;
      if (i === 0 && Number(slide.Time) > 0) {
        const defaultSlide = images.DefaultSlide || images.DefaultStreamImage;
        const defaultName = (defaultSlide as Record<string, unknown>)?.ImageFilename;
        if (defaultName) fragments.push({ path: String(defaultName), duration: Number(slide.Time) / 1000 });
      }
      const nextTime =
        Number(slides[i + 1]?.Time ?? duration ?? slide.Time ?? 0);
      fragments.push({
        path: fnameTemplate.replace('{0:04}', String(slide.Number ?? i + 1)).replace('{0:0', '').replace('}', String(slide.Number ?? i + 1)),
        duration: (nextTime - Number(slide.Time)) / 1000,
      });
    }

    return {
      format_id: `${streamId}-${snum}.slides`,
      ext: 'mhtml',
      url: slideBaseUrl,
      protocol: 'mhtml',
      acodec: 'none',
      vcodec: 'none',
      format_note: 'Slides',
      fragments: fragments.map((f) => ({ url: f.path, duration: f.duration })),
      fragment_base_url: slideBaseUrl,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const [rawUrl, data] = unsmuggle_url(url, {});
    const m = this._match_valid_url(rawUrl)!;
    const resourceId = m.groups!.id!;
    const query = m.groups!.query || '';
    const { text: webpage, url: redirectUrl } = (await this._request_webpage(rawUrl, resourceId))!;
    const servicePath = urljoin(
      redirectUrl,
      this._html_search_regex(/<div[^>]+\bid=["']ServicePath[^>]+>(.+?)<\/div>/, webpage, resourceId, '/Mediasite/PlayerService/PlayerService.svc/json', false) ||
        '/Mediasite/PlayerService/PlayerService.svc/json',
    );

    const playerOptions = (
      await this._download_json<{ d: Record<string, unknown> }>(`${servicePath}/GetPlayerOptions`, resourceId, undefined, {
        headers: {
          'Content-type': 'application/json; charset=utf-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        data: JSON.stringify({
          getPlayerOptionsRequest: {
            ResourceId: resourceId,
            QueryString: query,
            UrlReferrer: data.UrlReferrer || '',
            UseScreenReader: false,
          },
        }),
        method: 'POST',
      })
    ).d;

    const presentation = (playerOptions.Presentation as Record<string, unknown>) || {};
    if (!presentation || !presentation.Title) {
      throw new ExtractorError(`Mediasite says: ${playerOptions.PlayerPresentationStatusMessage}`, { expected: true });
    }

    const formats: Format[] = [];
    const thumbnails: Thumbnail[] = [];
    const images = (playerOptions.PlayerLayoutOptions as Record<string, unknown>)?.Images as Record<string, unknown>;

    for (let snum = 0; snum < ((presentation.Streams as unknown[]) || []).length; snum++) {
      const stream = (presentation.Streams as Array<Record<string, unknown>>)[snum]!;
      const streamType = Number(stream.StreamType);
      const streamId = STREAM_TYPES[streamType] || `type${streamType}`;
      const videoUrls = Array.isArray(stream.VideoUrls) ? stream.VideoUrls : [];
      const streamFormats: Format[] = [];

      for (let unum = 0; unum < videoUrls.length; unum++) {
        const video = videoUrls[unum] as Record<string, unknown>;
        const videoUrl = url_or_none(video.Location);
        if (!videoUrl) continue;
        const ext = mimetype2ext(String(video.MimeType ?? '')) || '';
        if (video.MediaType === 'SS') {
          streamFormats.push({ format_id: `${streamId}-${snum}.${unum}`, url: videoUrl, ext: ext || 'ism' });
        } else if (video.MediaType === 'Dash') {
          const mpd = await extractMpdFormatsAndSubtitles(this, videoUrl, resourceId, `${streamId}-${snum}.${unum}`);
          streamFormats.push(...mpd.formats);
        } else if (ext === 'm3u8' || ext === 'm3u') {
          const hls = await extractM3u8FormatsAndSubtitles(this, videoUrl, resourceId, `${streamId}-${snum}.${unum}`);
          streamFormats.push(...hls.formats);
        } else {
          streamFormats.push({ format_id: `${streamId}-${snum}.${unum}`, url: videoUrl, ext: ext || undefined });
        }
      }

      if (stream.HasSlideContent && images) {
        streamFormats.push(
          this._extractSlides({
            streamId,
            snum,
            stream,
            duration: float_or_none(presentation.Duration) ?? undefined,
            images,
          }),
        );
      }

      if (streamType !== 0) streamFormats.forEach((f) => (f.quality = -10));
      const thumbUrl = url_or_none(stream.ThumbnailUrl);
      if (thumbUrl) {
        thumbnails.push({
          id: `${streamId}-${snum}`,
          url: urljoin(redirectUrl, thumbUrl),
          preference: streamType !== 0 ? -1 : 0,
        });
      }
      formats.push(...streamFormats);
    }

    return {
      id: resourceId,
      title: String(presentation.Title),
      description: str_or_none(presentation.Description) ?? undefined,
      duration: float_or_none(presentation.Duration, 1000) ?? undefined,
      timestamp: float_or_none(presentation.UnixTime, 1000) ?? undefined,
      formats,
      thumbnails,
    };
  }
}

export class MediasiteCatalogIE extends InfoExtractor {
  static IE_NAME = 'mediasite:catalog';
  static _VALID_URL = new RegExp(
    String.raw`(?<url>https?:\/\/[^/]+\/Mediasite)\/Catalog\/Full\/(?<catalog_id>${ID_RE})(?:\/(?<current_folder_id>${ID_RE})\/(?<root_dynamic_folder_id>${ID_RE}))?`,
    'i',
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const mediasiteUrl = m.groups!.url!;
    const catalogId = m.groups!.catalog_id!;
    const currentFolderId = m.groups!.current_folder_id || catalogId;
    const rootDynamicFolderId = m.groups!.root_dynamic_folder_id;
    const webpage = await this._download_webpage(url, catalogId);
    const antiForgeryToken = this._search_regex(
      /AntiForgeryToken\s*:\s*(["'])(?<value>(?:(?!\1).)+)\1/,
      webpage,
      'anti forgery token',
      null,
      false,
      'value',
    );
    const antiForgeryHeader = antiForgeryToken
      ? this._search_regex(
          /AntiForgeryHeaderName\s*:\s*(["'])(?<value>(?:(?!\1).)+)\1/,
          webpage,
          'anti forgery header name',
          'X-SOFO-AntiForgeryHeader',
          false,
          'value',
        ) || 'X-SOFO-AntiForgeryHeader'
      : undefined;

    const payload = {
      IsViewPage: true,
      IsNewFolder: true,
      AuthTicket: null,
      CatalogId: catalogId,
      CurrentFolderId: currentFolderId,
      RootDynamicFolderId: rootDynamicFolderId,
      ItemsPerPage: 1000,
      PageIndex: 0,
      PermissionMask: 'Execute',
      CatalogSearchType: 'SearchInFolder',
      SortBy: 'Date',
      SortDirection: 'Descending',
      StartDate: null,
      EndDate: null,
      StatusFilterList: null,
      PreviewKey: null,
      Tags: [],
    };
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=UTF-8',
      Referer: url,
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (antiForgeryToken && antiForgeryHeader) headers[antiForgeryHeader] = antiForgeryToken;

    const catalog = await this._download_json<Record<string, unknown>>(
      `${mediasiteUrl}/Catalog/Data/GetPresentationsForFolder`,
      catalogId,
      undefined,
      { data: JSON.stringify(payload), method: 'POST', headers },
    );

    const entries = ((catalog.PresentationDetailsList as Array<Record<string, unknown>>) || [])
      .filter((video) => video.Id)
      .map((video) => this.url_result(`${mediasiteUrl}/Play/${video.Id}`, 'Mediasite', String(video.Id)));

    const title = str_or_none((catalog.CurrentFolder as Record<string, unknown>)?.Name);
    return this.playlist_result(entries, catalogId, title);
  }
}

export class MediasiteNamedCatalogIE extends InfoExtractor {
  static IE_NAME = 'mediasite:catalog:name';
  static _VALID_URL = new RegExp(String.raw`(?<url>https?:\/\/[^/]+\/Mediasite)\/Catalog\/catalogs\/(?<catalog_name>[^/?#&]+)`, 'i');

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const mediasiteUrl = m.groups!.url!;
    const catalogName = m.groups!.catalog_name!;
    const webpage = await this._download_webpage(url, catalogName);
    const catalogId = this._search_regex(new RegExp(`CatalogId\\s*:\\s*["'](${ID_RE})`), webpage, 'catalog id')!;
    return this.url_result(`${mediasiteUrl}/Catalog/Full/${catalogId}`, 'MediasiteCatalog', catalogId);
  }
}
