/** HTTP TTS，对应 legado HttpTTS.kt */
export interface HttpTTS {
  id: number;
  name: string;
  url: string;
  contentType?: string;
  concurrentRate?: string;
  loginUrl?: string;
  loginUi?: string;
  header?: string;
  jsLib?: string;
  enabledCookieJar?: boolean;
  loginCheckJs?: string;
  lastUpdateTime: number;
}
