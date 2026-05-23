/** URL 请求记录，对应 legado UrlRecord.kt */
export interface UrlRecord {
  id?: number;
  url: string;
  domain: string;
  method: string;
  sourceName?: string;
  sourceUrl?: string;
  timestamp: number;
  responseCode: number;
  duration: number;
  requestBody?: string;
  errorMsg?: string;
}
