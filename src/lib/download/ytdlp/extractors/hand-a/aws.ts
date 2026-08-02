/**
 * AWSIE — AWS SigV4 execute-api base (yt-dlp aws.py)
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';

export type AwsCredentials = {
  access_key: string;
  secret_key: string;
  uri: string;
  session_token?: string;
};

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(digest);
}

async function hmacSha256(key: BufferSource, message: string): Promise<ArrayBuffer> {
  const raw =
    key instanceof ArrayBuffer
      ? key
      : key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

function urlEncodeQuery(query: Record<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.join('&');
}

export class AWSIE extends InfoExtractor {
  static IE_NAME = 'aws';
  static _VALID_URL = false as const;
  static _AWS_ALGORITHM = 'AWS4-HMAC-SHA256';
  static _AWS_REGION = 'us-east-1';

  /** Subclasses must override */
  protected static _AWS_PROXY_HOST = '';
  protected static _AWS_API_KEY = '';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AWSIE is not a standalone extractor', { expected: true });
  }

  /** SigV4-signed GET to AWS API Gateway proxy — mirrors upstream _aws_execute_api */
  async _aws_execute_api<T = unknown>(
    awsDict: AwsCredentials,
    videoId: string,
    query: Record<string, string> = {},
  ): Promise<T> {
    const Ctor = this.constructor as typeof AWSIE;
    const proxyHost = Ctor._AWS_PROXY_HOST;
    const apiKey = Ctor._AWS_API_KEY;
    if (!proxyHost || !apiKey) {
      throw new ExtractorError('AWSIE subclass must set _AWS_PROXY_HOST and _AWS_API_KEY');
    }

    const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const date = amzDate.slice(0, 8);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Host: proxyHost,
      'X-Amz-Date': amzDate,
      'X-Api-Key': apiKey,
    };
    const sessionToken = awsDict.session_token;
    if (sessionToken) headers['X-Amz-Security-Token'] = sessionToken;

    const canonicalQuerystring = urlEncodeQuery(query);
    let canonicalHeaders = '';
    for (const headerName of Object.keys(headers).sort()) {
      canonicalHeaders += `${headerName.toLowerCase()}:${headers[headerName]}\n`;
    }
    const signedHeaders = Object.keys(headers)
      .sort()
      .map((h) => h.toLowerCase())
      .join(';');

    const canonicalRequest = [
      'GET',
      awsDict.uri,
      canonicalQuerystring,
      canonicalHeaders,
      signedHeaders,
      await sha256Hex(''),
    ].join('\n');

    const credentialScopeList = [date, Ctor._AWS_REGION, 'execute-api', 'aws4_request'];
    const credentialScope = credentialScopeList.join('/');
    const stringToSign = [
      Ctor._AWS_ALGORITHM,
      amzDate,
      credentialScope,
      await sha256Hex(canonicalRequest),
    ].join('\n');

    let kSigning: BufferSource = new TextEncoder().encode(`AWS4${awsDict.secret_key}`);
    for (const value of credentialScopeList) {
      kSigning = new Uint8Array(await hmacSha256(kSigning, value));
    }
    const signature = toHex(await hmacSha256(kSigning, stringToSign));

    headers.Authorization = [
      `${Ctor._AWS_ALGORITHM} Credential=${awsDict.access_key}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    const requestUrl = `https://${proxyHost}${awsDict.uri}${canonicalQuerystring ? `?${canonicalQuerystring}` : ''}`;
    return this._download_json<T>(requestUrl, videoId, 'AWS API request', { headers });
  }
}
