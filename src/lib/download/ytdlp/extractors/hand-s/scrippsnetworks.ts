/** ScrippsNetworks family — ported from yt-dlp scrippsnetworks.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { smuggle_url } from '../../utils';
import { urlencodePostdata } from './_helpers';

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class ScrippsNetworksWatchIE extends InfoExtractor {
  static IE_NAME = 'scrippsnetworks:watch';
  static _VALID_URL =
    /https?:\/\/watch\.(?<site>geniuskitchen)\.com\/(?:player\.[A-Z0-9]+\.html#|show\/(?:[^/]+\/){2}|player\/)(?<id>\d+)/;
  static _SNI_TABLE: Record<string, string> = { geniuskitchen: 'genius' };
  static _AWS_API_KEY = 'E7wSQmq0qK6xPrF13WmzKiHo4BQ7tip4pQcSXVl1';
  static _AWS_PROXY_HOST = 'web.api.video.snidigital.com';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const siteId = m.groups!.site!;
    const videoId = m.groups!.id!;

    const awsIdentityIdJson = JSON.stringify({
      IdentityId: 'us-east-1:7655847c-0ae7-4d9b-80d6-56c062927eb3',
    });
    const tokenResp = await this._download_json<{ Token?: string }>(
      'https://cognito-identity.us-east-1.amazonaws.com/',
      videoId,
      undefined,
      {
        method: 'POST',
        data: awsIdentityIdJson,
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/x-amz-json-1.1',
          Referer: url,
          'X-Amz-Content-Sha256': await sha256Hex(awsIdentityIdJson),
          'X-Amz-Target': 'AWSCognitoIdentityService.GetOpenIdToken',
          'X-Amz-User-Agent': 'aws-sdk-js/2.80.0 callback',
        },
      },
    );

    const stsXml = await this._download_webpage(
      'https://sts.amazonaws.com/',
      videoId,
      undefined,
      {
        method: 'POST',
        data: urlencodePostdata({
          Action: 'AssumeRoleWithWebIdentity',
          RoleArn: 'arn:aws:iam::710330595350:role/Cognito_WebAPIUnauth_Role',
          RoleSessionName: 'web-identity',
          Version: '2011-06-15',
          WebIdentityToken: tokenResp.Token!,
        }),
        headers: {
          Referer: url,
          'X-Amz-User-Agent': 'aws-sdk-js/2.80.0 callback',
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
      },
    );

    const getSts = (key: string) => {
      const re = new RegExp(`<${key}>([^<]+)</${key}>`);
      const val = re.exec(stsXml)?.[1];
      if (!val) throw new Error(`Missing STS ${key}`);
      return val;
    };

    const apiResp = await this._download_json<{ results?: Array<{ mcpId?: string }> }>(
      `https://${ScrippsNetworksWatchIE._AWS_PROXY_HOST}/1/web/brands/${ScrippsNetworksWatchIE._SNI_TABLE[siteId]}/episodes/scrid/${videoId}`,
      videoId,
      undefined,
      {
        headers: {
          'X-Api-Key': ScrippsNetworksWatchIE._AWS_API_KEY,
          'X-Amz-Security-Token': getSts('SessionToken'),
        },
      },
    );
    const mcpId = apiResp.results?.[0]?.mcpId;
    return this.url_result(
      smuggle_url(`anvato:anvato_scripps_app_web_prod_0837996dbe373629133857ae9eb72e740424d80a:${mcpId}`, {
        geo_countries: ['US'],
      }),
      'Anvato',
      mcpId,
    );
  }
}

export class ScrippsNetworksIE extends InfoExtractor {
  static IE_NAME = 'scrippsnetworks';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<site>cookingchanneltv|discovery|(?:diy|food)network|hgtv|travelchannel)\.com\/videos\/[0-9a-z-]+-(?<id>\d+)/;
  static _ACCOUNT_MAP: Record<string, number> = {
    cookingchanneltv: 2433005105,
    discovery: 2706091867,
    diynetwork: 2433004575,
    foodnetwork: 2433005105,
    hgtv: 2433004575,
    travelchannel: 2433005739,
  };

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const site = m.groups!.site!;
    const guid = m.groups!.id!;
    const account = ScrippsNetworksIE._ACCOUNT_MAP[site]!;
    return this.url_result(
      smuggle_url(`https://link.theplatform.com/s/ip77QC/media/guid/${account}/${guid}?mbr=true`, {
        force_smil_url: true,
      }),
      'ThePlatform',
      guid,
    );
  }
}
