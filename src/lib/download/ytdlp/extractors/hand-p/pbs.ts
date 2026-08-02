/** PBSIE — ported from yt-dlp pbs.py (main path) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  js_to_json,
  str_or_none,
  unified_strdate,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, orderedSet, strip_or_none } from './_helpers';

const STATIONS_RE = '(?:video|www|player)\.pbs\.org|video\.aptv\.org|video\.gpb\.org|video\.mpbonline\.org|video\.wnpt\.org|video\.wfsu\.org|video\.wsre\.org|video\.wtcitv\.org|video\.pba\.org|video\.alaskapublic\.org|kuac\.org|ktoo\.org|azpm\.org|video\.azpbs\.org|portal\.knme\.org|video\.vegaspbs\.org|watch\.aetn\.org|video\.ket\.org|video\.wkno\.org|video\.lpb\.org|videos\.oeta\.tv|video\.optv\.org|watch\.wsiu\.org|video\.keet\.org|pbs\.kixe\.org|video\.kpbs\.org|video\.kqed\.org|vids\.kvie\.org|(?:video\.|www\.)pbssocal\.org|video\.valleypbs\.org|video\.cptv\.org|watch\.knpb\.org|video\.soptv\.org|klcs\.org|krcb\.org|kvcr\.org|video\.rmpbs\.org|video\.kenw\.org|video\.kued\.org|video\.wyomingpbs\.org|video\.cpt12\.org|video\.kbyueleven\.org|(?:video\.|www\.)thirteen\.org|video\.wgbh\.org|video\.wgby\.org|watch\.njtvonline\.org|ripbs\.org|watch\.wliw\.org|video\.mpt\.tv|watch\.weta\.org|video\.whyy\.org|video\.wlvt\.org|video\.wvpt\.net|video\.whut\.org|video\.wedu\.org|video\.wgcu\.org|wjct\.org|video\.wpbt2\.org|video\.wucftv\.org|video\.wuft\.org|watch\.wxel\.org|video\.wlrn\.org|video\.wusf\.usf\.edu|video\.scetv\.org|video\.unctv\.org|pbsguam\.org|video\.pbshawaii\.org|video\.idahoptv\.org|video\.ksps\.org|watch\.opb\.org|watch\.nwptv\.org|video\.will\.illinois\.edu|video\.networkknowledge\.tv|video\.wttw\.com|wtvp\.org|video\.iptv\.org|video\.ninenet\.org|video\.wfwa\.org|video\.wfyi\.org|video\.mptv\.org|video\.wnin\.org|video\.wnit\.org|video\.wpt\.org|video\.wvut\.org|video\.weiu\.net|video\.wqpt\.org|video\.wycc\.org|lakeshorepublicmedia\.org|video\.wipb\.org|video\.indianapublicmedia\.org|watch\.cetconnect\.org|video\.thinktv\.org|video\.wbgu\.org|video\.wgvu\.org|video\.netnebraska\.org|video\.pioneer\.org|watch\.sdpb\.org|video\.tpt\.org|watch\.ksmq\.org|watch\.kpts\.org|watch\.ktwu\.org|shptv\.org|kcpt\.org|blueridgepbs\.org|watch\.easttennesseepbs\.org|video\.wcte\.tv|video\.wljt\.org|video\.wosu\.org|video\.woub\.org|video\.wvpublic\.org|video\.wkyupbs\.org|wyes\.org|video\.kera\.org|video\.mpbn\.net|video\.mountainlake\.org|video\.nhptv\.org|video\.vpt\.org|video\.witf\.org|watch\.wqed\.org|video\.wmht\.org|video\.deltabroadcasting\.org|video\.dptv\.org|video\.wcmu\.org|video\.wkar\.org|wnmuvideo\.nmu\.edu|video\.wdse\.org|video\.wgte\.org|video\.lptv\.org|prairiepublic\.org|video\.kmos\.org|watch\.montanapbs\.org|video\.krwg\.org|video\.kacvtv\.org|video\.kcostv\.org|video\.wcny\.org|video\.wned\.org|watch\.wpbstv\.org|video\.wskg\.org|video\.wxxi\.org|video\.wpsu\.org|wqln\.org|on-demand\.wvia\.org|video\.wtvi\.org|whro\.org|video\.westernreservepublicmedia\.org|video\.ideastream\.org|video\.kcts9\.org|video\.basinpbs\.org|video\.houstonpbs\.org|tamu\.edu|kedt\.org|video\.klrn\.org|video\.klru\.tv|kmbh\.org|knct\.org|ktxt\.org|video\.wtjx\.org|video\.ideastations\.org|video\.kbtc\.org';

const MEDIA_ID_RES = [
  /div\s*:\s*'videoembed'\s*,\s*mediaid\s*:\s*'(\d+)'/,
  /class="coveplayerid">([^<]+)</,
  /<section[^>]+data-coveid="(\d+)"/,
  /\sclass="passportcoveplayer"[^>]*\sdata-media="(\d+)"/,
  /<input type="hidden" id="pbs_video_id_[0-9]+" value="([0-9]+)"\/>/,
  /window\.PBS\.playerConfig\s*=\s*\{[^}]*id\s*:\s*'(\d+)'/,
  /<div[^>]+\bdata-cove-id=["'](\d+)["']/,
  /<iframe[^>]+\bsrc=["'](?:https?:)?\/\/video\.pbs\.org\/widget\/partnerplayer\/(\d+)/,
  /\\"videoTPMediaId\\":\\"(\d+)\\"/,
  /\bhttps?:\/\/player\.pbs\.org\/[\w-]+player\/(\d+)/,
];

export class PBSIE extends InfoExtractor {
  static IE_NAME = 'pbs';
  static _GEO_COUNTRIES = ['US'];
  static _VALID_URL = new RegExp(
    'https?:\\/' +
      '(?:' +
      '(?:video|player)\\.pbs\\.org\\/(?:widget\\/)?partnerplayer\\/(?<player_id>[^/?#]+)|' +
      '(?:' +
      STATIONS_RE +
      ')\\/(?:' +
      '(?:(?:vir|port)alplayer|video)\\/(?<id>[0-9]+)(?:[?/#]|$)|' +
      '(?:[^/?#]+\\/){1,5}(?<presumptive_id>[^/?#]+?)(?:\\.html)?\\/?(?:$|[?#])' +
      ')' +
      ')',
  );

  protected geoHeaders(): Record<string, string> {
    return { Referer: 'http://www.pbs.org/' };
  }

  async _real_initialize(): Promise<void> {
    const resp = await this._download_json<{ cookie?: string }>(
      'http://localization.services.pbs.org/localize/auto/cookie/',
      undefined,
      undefined,
      { headers: this.geoHeaders(), fatal: false },
    );
    const cookie = resp?.cookie;
    if (cookie) {
      void /#?s=\["([^"]+)"\]/.exec(cookie)?.[1];
    }
  }

  protected extractVideoData(text: string, videoId: string): Record<string, unknown> {
    const raw =
      this._search_regex(
        [/PBS\.videoData\s*=\s*(\{.+?\});\n/, /window\.videoBridge\s*=\s*(\{.+?\});/],
        text,
        'video data',
        '{}',
        false,
      ) || '{}';
    return this._parse_json(raw, videoId, js_to_json, false) as Record<string, unknown>;
  }

  protected async resolveVideoId(url: string): Promise<[string, string, string | null, string | null]> {
    const mobj = this._match_valid_url(url)!;
    let displayId = mobj.groups?.presumptive_id || mobj.groups?.player_id || mobj.groups?.id || '';
    let description: string | null = null;

    if (mobj.groups?.presumptive_id) {
      const webpage = await this._download_webpage(url, displayId);
      description =
        strip_or_none(this._og_search_description(webpage)) ||
        strip_or_none(this._html_search_meta('description', webpage));
      const uploadDate = unified_strdate(
        this._search_regex(/<input type="hidden" id="air_date_[0-9]+" value="([^"]+)"/, webpage, 'upload date', null, false),
      );
      for (const re of [
        /<div[^>]+class="videotab[^"]*"[^>]+vid="(\d+)"/g,
        /<a[^>]+href=["']#(?:video-|part)\d+["'][^>]+data-cove[Ii]d=["'](\d+)'/g,
      ]) {
        const ids = orderedSet([...webpage.matchAll(re)].map((x) => x[1]!));
        if (ids.length) return [ids.join(','), displayId, uploadDate, description];
      }
      for (const re of MEDIA_ID_RES) {
        const mediaId = this._search_regex(re, webpage, 'media ID', null, false);
        if (mediaId) return [mediaId, displayId, uploadDate, description];
      }
    }

    if (mobj.groups?.player_id) {
      displayId = displayId || mobj.groups.player_id;
      const player = await this._download_webpage(url, displayId, 'Downloading player page', { fatal: false });
      if (player) {
        let videoId = this._search_regex(/<div\s+id=["']video_(\d+)/, player, 'video ID', null, false);
        if (!videoId) {
          const vi = this.extractVideoData(player, displayId);
          videoId = String(vi.id || vi.contentID || '');
        }
        if (videoId) return [videoId, displayId, null, description];
      }
    }

    const videoId = mobj.groups?.id || displayId;
    return [videoId!, displayId || videoId!, null, description];
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const [videoIdRaw, displayId, uploadDate, description] = await this.resolveVideoId(url);
    if (videoIdRaw.includes(',')) {
      const entries = videoIdRaw.split(',').map((vid) => this.url_result(`http://video.pbs.org/video/${vid}`, 'PBS', vid));
      return this.playlist_result(entries, displayId);
    }
    const videoId = videoIdRaw;

    let info: Record<string, unknown> = {};
    const redirects: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    const addRedirect = (u: string, extra: Record<string, unknown> = {}) => {
      if (!u || seen.has(u)) return;
      seen.add(u);
      redirects.push({ url: u, ...extra });
    };

    for (const page of ['widget/partnerplayer', 'portalplayer'] as const) {
      const player = await this._download_webpage(`http://player.pbs.org/${page}/${videoId}`, displayId, `Downloading ${page} page`, {
        fatal: false,
      });
      if (!player) continue;
      const vi = this.extractVideoData(player, displayId);
      if (vi && Object.keys(vi).length) {
        if (!Object.keys(info).length) info = vi;
        for (const key of ['recommended_encoding', 'alternate_encoding'] as const) {
          const enc = vi[key] as Record<string, unknown> | undefined;
          addRedirect(String(enc?.url ?? ''), { eeid: enc?.eeid });
        }
        if (Array.isArray(vi.encodings)) {
          for (const enc of vi.encodings) addRedirect(String(enc ?? ''));
        }
      }
    }

    const formats: Format[] = [];
    let hlsSubs: Record<string, Subtitle[]> = {};
    for (const [i, redirect] of redirects.entries()) {
      const redirectInfo = await this._download_json<Record<string, unknown>>(
        `${redirect.url}?format=json`,
        displayId,
        `Downloading redirect ${i}`,
        { headers: this.geoHeaders() },
      );
      if (redirectInfo.status === 'error') {
        const code = int_or_none(redirectInfo.http_code);
        const msg =
          ({ 101: 'not yet available', 403: 'not available in your region', 404: 'technical difficulties', 410: 'expired' } as Record<number, string>)[
            code ?? 0
          ] || String(redirectInfo.message ?? 'error');
        if (code === 403) this.raise_geo_restricted(msg, PBSIE._GEO_COUNTRIES);
        throw new ExtractorError(`${PBSIE.IE_NAME} said: ${msg}`, { expected: true });
      }
      const formatUrl = url_or_none(redirectInfo.url);
      if (!formatUrl) continue;
      if (determine_ext(formatUrl) === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, formatUrl, displayId, 'hls');
        formats.push(...res.formats);
        hlsSubs = { ...hlsSubs, ...res.subtitles };
      } else {
        formats.push({ url: formatUrl, format_id: str_or_none(redirect.eeid) || String(i) });
      }
    }

    const subtitles: Record<string, Subtitle[]> = {};
    const cc = (info.cc as Record<string, string>) || {};
    for (const captionUrl of Object.values(cc)) {
      if (!captionUrl) continue;
      subtitles.en = subtitles.en || [];
      subtitles.en.push({ url: captionUrl, ext: 'vtt' });
    }
    const merged = { ...subtitles, ...hlsSubs };

    let title = String(info.title ?? displayId);
    const program = (info.program as Record<string, unknown>) || {};
    const altTitle = str_or_none(program.title);
    if (altTitle) title = `${altTitle} - ${title.replace(new RegExp(`^${altTitle}[\s\-:]+`), '')}`;

    return {
      id: videoId,
      display_id: displayId,
      title,
      description: str_or_none(info.description) || str_or_none(program.description) || description,
      thumbnail: url_or_none(info.image_url) ?? undefined,
      duration: float_or_none(info.duration) ?? undefined,
      upload_date: uploadDate ?? undefined,
      formats,
      subtitles: Object.keys(merged).length ? merged : undefined,
    };
  }
}

export class PBSKidsIE extends InfoExtractor {
  static IE_NAME = 'pbskids';
  static _VALID_URL = /https?:\/\/(?:www\.)?pbskids\.org\/video\/[\w-]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const meta = this._search_json(/window\._PBS_KIDS_DEEPLINK\s*=/, webpage, 'video info', videoId) as Record<
      string,
      unknown
    > | null;
    const videoObj = (meta?.video_obj as Record<string, unknown>) || {};
    const uri = url_or_none(videoObj.URI);
    if (!uri) throw new ExtractorError('Unable to extract PBS Kids stream URI', { expected: true });
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, uri, videoId, 'mp4');
    const videoType = str_or_none(videoObj.video_type);
    return {
      id: videoId,
      formats,
      subtitles,
      categories: videoType ? [videoType] : undefined,
      channel: str_or_none(meta?.show_slug) ?? undefined,
      description: str_or_none(videoObj.description) ?? undefined,
      duration: int_or_none(videoObj.duration) ?? undefined,
      series: str_or_none(videoObj.program_title) ?? undefined,
      title: str_or_none(videoObj.title) ?? videoId,
      upload_date: unified_strdate(str_or_none(videoObj.air_date)) ?? undefined,
    };
  }
}
