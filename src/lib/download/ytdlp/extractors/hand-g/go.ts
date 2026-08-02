/**
 * GoIE — ported from yt-dlp go.py (ABC / Disney / FX / NatGeo via Adobe Pass)
 */

import { ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  join_nonempty,
  traverse_obj,
  unified_timestamp,
} from '../../utils';
import { AdobePassIE } from '../hand-bases';
import { extractM3u8FormatsAndSubtitles, parse_age_limit, urlencodePostdata } from './_helpers';

const URL_PATH_RE = String.raw`(?:video|episode|movies-and-specials)/(?<id>[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})`;

const SITE_INFO: Record<
  string,
  { brand: string; requestor_id: string; provider_id: string; software_statement: string; resource_id?: string }
> = {
  abc: {
    brand: '001',
    requestor_id: 'dtci',
    provider_id: 'ABC',
    software_statement:
      'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI4OTcwMjlkYS0yYjM1LTQyOWUtYWQ0NS02ZjZiZjVkZTdhOTUiLCJuYmYiOjE2MjAxNzM5NjksImlzcyI6ImF1dGguYWRvYmUuY29tIiwiaWF0IjoxNjIwMTczOTY5fQ.SC69DVJWSL8sIe-vVUrP6xS_kzHKqwz9PdKYexs_y-f7Vin6mM-7S-W1TE_-K55O0pyf-TL4xYgvm6LIye8CckG-nZfVwNPV4huduov0jmIcxCQFeUwkHULG2IaA44wfBVUBdaHgkhPweZ2amjycO_IXtez-gBXOLbE3B7Gx9j_5ISCFtyVUblThKfoGyQv6KT6t8Vpmc4ZSKCCQp74KWFFypydb9ucego1taW_nQD06Cdf4yByLd6NaTBceMcIKbug9b9gxFm3XBgJ5q3z7KGo1Kr6XalAV5j4m-fQ91wczlTilX8FM4AljMupyRM9mA_aEADILQ4hS79q4SM0w6w',
  },
  freeform: {
    brand: '002',
    requestor_id: 'ABCFamily',
    provider_id: 'ABCFamily',
    software_statement:
      'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhZWM2MGYyNC0xYzRjLTQ1NzQtYjc0Zi03ZmM4N2E5YWMzMzgiLCJuYmYiOjE1ODc2NjU5MjMsImlzcyI6ImF1dGguYWRvYmUuY29tIiwiaWF0IjoxNTg3NjY1OTIzfQ.flCn3dhvmvPnWmV0JV8Fm0YFyj07yPez9-n1GFEwVIm_S2wQVWbWyJhqsAyLZVFrhOMZYTqmPS3OHxGwTwXkEYn6PD7o_vIVG3oqi-Xn1m5jRt_Gazw5qEtpat6VE7bvKGSD3ZhcidOrsCk8NcYyq75u61NHDvSl81pcedJjVRVUpsqrEwmo0aVbA0C8PX3ri0mEbGvkMKvHn8E60xp-PSE-VK8SDT0plwPu_TwUszkZ6-_I8_2xcv_WBqcXFkAVg7Q-iNJXgQvmNsrpcrYuLvi6hEH4ZLtoDcXU6MhwTQAJTiHSo8x9aHX1_qFP09CzlNOFQbC2ZEJdP9SvA53SLQ',
  },
  disneynow: {
    brand: '011',
    requestor_id: 'DisneyChannels',
    provider_id: 'DisneyChannels',
    software_statement:
      'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI1MzAzNTRiOS04NDNiLTRkNjAtYTQ3ZS0yNzk1MzlkOTIyNTciLCJuYmYiOjE1NTg5ODc0NDksImlzcyI6ImF1dGguYWRvYmUuY29tIiwiaWF0IjoxNTU4OTg3NDQ5fQ.Jud6YS6-J2h0h6po0oMheDym0qRTJQGj4kzacrz4DFuEwhcBkkykW6pF5pKuAUJy9HCZ40oDAHe2KcTlDJjCZF5tDaUEfdihakZ9cC_rG7MU-QoRne8qaB_dPDKwGuk-ZyWD8eV3zwTJmbGo8hDxYTEU81YNCxwhyc_BPDr5TYiubbmpP3_pTnXmSpuL58isJ2peSKWlX9BacuXtBY25c_QnPFKk-_EETm7IHkTpDazde1QfHWGu4s4yJpKGk8RVVujVG6h6ELlL-ZeYLilBm7iS7h1TYG1u7fJhyZRL7isaom6NvAzsvN3ngss1fLwt8decP8wzdFHrbYTdTjW8qw',
    resource_id: 'Disney',
  },
  fxnetworks: {
    brand: '025',
    requestor_id: 'dtci',
    provider_id: 'fx',
    software_statement:
      'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIzYWRhYWZiNC02OTAxLTRlYzktOTdmNy1lYWZkZTJkODJkN2EiLCJuYmYiOjE1NjIwMjQwNzYsImlzcyI6ImF1dGguYWRvYmUuY29tIiwiaWF0IjoxNTYyMDI0MDc2fQ.dhKMpZK50AObbZYrMiYPSfWtzXHUaeMP3jrIY4Cgfvh0GaEgk0Mns_zp78jypFeZgRtPVleQMQDNq2YEloRLcAGqP1aa6WVDglnK77ZWUm4IKai14Rwf3A6YBhSRoO2_lMmUGkuTf6gZY-kMIPqBYKqzTQiQl4HbniPFodIzFRiuI9QJVrkoyTGrJL4oqiX08PoFI3Z-TOti1Heu3EbFC-GveQHhlinYrzU7rbiAqLEz7FImtfBDsnXX1Y3uJDLYM3Bq4Oh0nrzTv1Fd62wNsCNErHHIbELidh1zZF0ujvt7ReuZUwAitm0UhEJ7OxNOUbEQWtae6pVNscvdvTFMpg',
  },
  nationalgeographic: {
    brand: '026',
    requestor_id: 'dtci',
    provider_id: 'ngc',
    software_statement:
      'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMzE4YTM1Ni05Mjc4LTQ4NjEtYTFmNi1jMTIzMzg1ZWMzYzMiLCJuYmYiOjE1NjIwMjM4MjgsImlzcyI6ImF1dGguYWRvYmUuY29tIiwiaWF0IjoxNTYyMDIzODI4fQ.Le-2OzF9-jrhJ7ZfWtLWk5iSHGVZoxeU1w0_fO--Heli0OwRZsRq2slSmx-oZTzxuWmAgDEiBkWSDcDK6sM25DrCLsdsJa3MBuZ-slBRtH8aq3HpNoqqLkU-vg6gRUEKMtwBUtwCu_9aKUCayYtndWv4b1DjVQeSrteOW5NNudWVYleAe0kxeNJQHo5If9SCzDudKVJktFUjhNks4QPOC_uONPkRRlL9D0fNvtOY-LRFckfcHhf5z9l1iZjeukV0YhdKnuw1wyiaWrQXBUDiBfbkCRd2DM-KnelqPxfiXCaTjGKDURRBO3pz33ebge3IFXSiU5vl4qHQ8xvunzGpFw',
  },
};

// @ts-expect-error AdobePassIE._VALID_URL is false; GoIE overrides with real patterns
export class GoIE extends AdobePassIE {
  static IE_NAME = 'go';
  static _VALID_URL = [
    new RegExp(`https?:\\/\\/(?:www\\.)?(?<site>abc)\\.com\\/${URL_PATH_RE}`),
    new RegExp(`https?:\\/\\/(?:www\\.)?(?<site>freeform)\\.com\\/${URL_PATH_RE}`),
    new RegExp(`https?:\\/\\/(?:www\\.)?(?<site>disneynow)\\.com\\/${URL_PATH_RE}`),
    new RegExp(`https?:\\/\\/fxnow\\.(?<site>fxnetworks)\\.com\\/${URL_PATH_RE}`),
    new RegExp(`https?:\\/\\/(?:www\\.)?(?<site>nationalgeographic)\\.com\\/tv\\/${URL_PATH_RE}`),
  ];

  protected async _extractVideos(brand: string, videoId = '-1', showId = '-1') {
    const displayId = videoId !== '-1' ? videoId : showId;
    const data = await this._download_json<{ video: Array<Record<string, unknown>> }>(
      `http://api.contents.watchabc.go.com/vp2/ws/contents/3000/videos/${brand}/001/-1/${showId}/-1/${videoId}/-1/-1.json`,
      displayId,
    );
    return data.video;
  }

  protected _extractGlobalVar(name: string, webpage: string, videoId: string) {
    return this._search_json<Record<string, unknown>>(
      new RegExp(`window\\[["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']\\]\\s*=`),
      webpage,
      `${name.trim()}_ JSON`,
      videoId,
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const site = m.groups!.site!;
    const displayId = m.groups!.id!;
    const webpage = await this._download_webpage(url, displayId);
    const config = this._extractGlobalVar('__CONFIG__', webpage, displayId)!;
    const data = this._extractGlobalVar(String(config.globalVar ?? ''), webpage, displayId)!;

    let videoId = traverse_obj(data, ['page', 'content', 'video', 'layout', 'video', 'id']) as string | undefined;
    if (!videoId) {
      videoId =
        this._search_regex(
          [
            /data-(?:track-)?video[_-]id(?:_code)?=["']*((?:vdka|VDKA)\d+)/,
            /\bvideoIdCode["']\s*:\s*["']((?:vdka|VDKA)\d+)"/,
          ],
          webpage,
          'video ID',
        ) || undefined;
    }

    const siteInfo = SITE_INFO[site]!;
    const brand = siteInfo.brand;
    const videoData = (await this._extractVideos(brand, videoId || '-1'))[0]!;
    const resolvedVideoId = String(videoData.id ?? videoId);
    const title = String(videoData.title ?? resolvedVideoId);

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const assets = ((videoData.assets as Record<string, unknown>)?.asset as Array<Record<string, unknown>>) || [];

    for (const asset of assets) {
      const assetUrl = asset.value as string | undefined;
      if (!assetUrl) continue;
      const formatId = asset.format as string | undefined;
      const ext = determine_ext(assetUrl);
      if (ext === 'm3u8') {
        const payload: Record<string, string> = {
          video_id: resolvedVideoId,
          video_type: String(videoData.type ?? ''),
          brand,
          device: '001',
          app_name: 'webplayer-abc',
        };
        if (String(videoData.accesslevel) === '1') {
          const providerId = siteInfo.provider_id;
          const resource =
            siteInfo.resource_id ||
            AdobePassIE._get_mvpd_resource(providerId, title, resolvedVideoId, title);
          const auth = await this._extract_mvpd_auth(
            url,
            resolvedVideoId,
            siteInfo.requestor_id,
            resource,
            siteInfo.software_statement,
          );
          Object.assign(payload, {
            token: auth,
            token_type: 'ap',
            adobe_requestor_id: providerId,
          });
        }
        const entitlement = await this._download_json<{ entitlement?: { uplynkData?: { sessionKey?: string } }; errors?: { errors?: Array<{ code?: number; message?: string }> } }>(
          'https://prod.gatekeeper.us-abc.symphony.edgedatg.go.com/vp2/ws-secure/entitlement/2020/playmanifest_secure.json',
          resolvedVideoId,
          undefined,
          { data: urlencodePostdata(payload) },
        );
        const errors = entitlement.errors?.errors || [];
        for (const error of errors) {
          if (error.code === 1002) this.raise_geo_restricted(error.message, ['US']);
        }
        if (errors.length) {
          throw new ExtractorError(`${GoIE.IE_NAME} said: ${errors.map((e) => e.message).join(', ')}`, {
            expected: true,
          });
        }
        const signedUrl = `${assetUrl}?${entitlement.entitlement?.uplynkData?.sessionKey ?? ''}`;
        const { formats: fmts, subtitles: subs } = await extractM3u8FormatsAndSubtitles(this, signedUrl, resolvedVideoId, formatId || 'hls');
        formats.push(...fmts);
        for (const [lang, tracks] of Object.entries(subs || {})) (subtitles[lang] ||= []).push(...tracks);
      } else {
        const f: Format = { format_id: formatId || ext || 'http', url: assetUrl, ext };
        const dim = /\/(\d+)x(\d+)\//.exec(assetUrl);
        if (dim) {
          f.format_id = join_nonempty(formatId, `${dim[2]}P`);
          f.width = Number(dim[1]);
          f.height = Number(dim[2]);
        } else if (/(?:\/mp4\/source\/|_source\.mp4)/.test(assetUrl)) {
          f.format_id = `${formatId ? `${formatId}-` : ''}SOURCE`;
          f.quality = 1;
        }
        formats.push(f);
      }
    }

    for (const cc of ((videoData.closedcaption as Record<string, unknown>)?.src as Array<Record<string, unknown>>) || []) {
      const ccUrl = cc.value as string | undefined;
      if (!ccUrl) continue;
      let ccExt = determine_ext(ccUrl);
      if (ccExt === 'xml') ccExt = 'ttml';
      (subtitles[String(cc.lang ?? 'en')] ||= []).push({ url: ccUrl, ext: ccExt });
    }

    const thumbnails = (((videoData.thumbnails as Record<string, unknown>)?.thumbnail as Array<Record<string, unknown>>) || [])
      .filter((t) => t.value)
      .map((t) => ({
        url: String(t.value),
        width: int_or_none(t.width) ?? undefined,
        height: int_or_none(t.height) ?? undefined,
      }));

    return {
      id: resolvedVideoId,
      title,
      description: String(videoData.longdescription ?? videoData.description ?? '') || undefined,
      duration: int_or_none((videoData.duration as Record<string, unknown>)?.value, 1000) ?? undefined,
      age_limit: parse_age_limit((videoData.tvrating as Record<string, unknown>)?.rating as string | undefined) ?? undefined,
      episode_number: int_or_none(videoData.episodenumber) ?? undefined,
      series: (videoData.show as Record<string, unknown>)?.title as string | undefined,
      season_number: int_or_none((videoData.season as Record<string, unknown>)?.num) ?? undefined,
      thumbnails,
      formats,
      subtitles,
      timestamp: unified_timestamp(traverse_obj(videoData, ['airdates', 'airdate', 0])) ?? undefined,
    };
  }
}
