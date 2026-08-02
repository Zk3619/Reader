/**
 * Hand-written batch F (facebook extras + fancode → fuyintv) — auto-rebuilt by port/rebuild-hand-f-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { FacebookAdsIE, FacebookPluginsVideoIE, FacebookRedirectURLIE } from './facebook-extra';
import { FancodeLiveIE, FancodeVodIE } from './fancode';
import { FathomIE } from './fathom';
import { FaulioIE, FaulioBaseIE, FaulioLiveIE } from './faulio';
import { FazIE } from './faz';
import { FC2IE, FC2EmbedIE, FC2LiveIE } from './fc2';
import { FczenitIE } from './fczenit';
import { FifaIE } from './fifa';
import { FilmArchivIE } from './filmarchiv';
import { FilmOnIE, FilmOnChannelIE } from './filmon';
import { FilmwebIE } from './filmweb';
import { FirstTVIE, FirstTVLiveIE } from './firsttv';
import { FiveTVIE } from './fivetv';
import { FlexTVIE } from './flextv';
import { FlickrIE } from './flickr';
import { FloatplaneIE, FloatplaneBaseIE, FloatplaneChannelIE, FloatplaneChannelBaseIE } from './floatplane';
import { FolketingetIE } from './folketinget';
import { FootyRoomIE } from './footyroom';
import { Formula1IE } from './formula1';
import { FourTubeIE, FourTubeBaseIE, FuxIE, PornerBrosIE, PornTubeIE } from './fourtube';
import { FOXIE } from './fox';
import { FOX9IE, FOX9NewsIE } from './fox9';
import { FoxNewsIE, FoxNewsArticleIE, FoxNewsVideoIE } from './foxnews';
import { FoxSportsIE } from './foxsports';
import { FptplayIE } from './fptplay';
import { FrancaisFacileIE } from './francaisfacile';
import { FranceTVIE, FranceTVInfoIE, FranceTVSiteIE } from './francetv';
import { FreesoundIE } from './freesound';
import { FreespeechIE } from './freespeech';
import { FreeTvIE, FreeTvBaseIE, FreeTvMoviesIE } from './freetv';
import { FrontendMastersIE, FrontendMastersBaseIE, FrontendMastersCourseIE, FrontendMastersLessonIE, FrontendMastersPageBaseIE } from './frontendmasters';
import { FrontoBaseIE, FrontroGroupBaseIE, FrontroVideoBaseIE } from './frontro';
import { FunkIE } from './funk';
import { Funker530IE } from './funker530';
import { FuyinTVIE } from './fuyintv';

export type HandFEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_F_IES: HandFEntry[] = [
  { ie_key: 'FacebookAds', IE: FacebookAdsIE },
  { ie_key: 'FacebookPluginsVideo', IE: FacebookPluginsVideoIE },
  { ie_key: 'FacebookRedirectURL', IE: FacebookRedirectURLIE },
  { ie_key: 'FancodeLive', IE: FancodeLiveIE },
  { ie_key: 'FancodeVod', IE: FancodeVodIE },
  { ie_key: 'Fathom', IE: FathomIE },
  { ie_key: 'Faulio', IE: FaulioIE },
  { ie_key: 'FaulioBase', IE: FaulioBaseIE },
  { ie_key: 'FaulioLive', IE: FaulioLiveIE },
  { ie_key: 'Faz', IE: FazIE },
  { ie_key: 'FC2', IE: FC2IE },
  { ie_key: 'FC2Embed', IE: FC2EmbedIE },
  { ie_key: 'FC2Live', IE: FC2LiveIE },
  { ie_key: 'Fczenit', IE: FczenitIE },
  { ie_key: 'Fifa', IE: FifaIE },
  { ie_key: 'FilmArchiv', IE: FilmArchivIE },
  { ie_key: 'FilmOn', IE: FilmOnIE },
  { ie_key: 'FilmOnChannel', IE: FilmOnChannelIE },
  { ie_key: 'Filmweb', IE: FilmwebIE },
  { ie_key: 'FirstTV', IE: FirstTVIE },
  { ie_key: 'FirstTVLive', IE: FirstTVLiveIE },
  { ie_key: 'FiveTV', IE: FiveTVIE },
  { ie_key: 'FlexTV', IE: FlexTVIE },
  { ie_key: 'Flickr', IE: FlickrIE },
  { ie_key: 'Floatplane', IE: FloatplaneIE },
  { ie_key: 'FloatplaneBase', IE: FloatplaneBaseIE },
  { ie_key: 'FloatplaneChannel', IE: FloatplaneChannelIE },
  { ie_key: 'FloatplaneChannelBase', IE: FloatplaneChannelBaseIE },
  { ie_key: 'Folketinget', IE: FolketingetIE },
  { ie_key: 'FootyRoom', IE: FootyRoomIE },
  { ie_key: 'Formula1', IE: Formula1IE },
  { ie_key: 'FourTube', IE: FourTubeIE },
  { ie_key: 'FourTubeBase', IE: FourTubeBaseIE },
  { ie_key: 'FOX', IE: FOXIE },
  { ie_key: 'FOX9', IE: FOX9IE },
  { ie_key: 'FOX9News', IE: FOX9NewsIE },
  { ie_key: 'FoxNews', IE: FoxNewsIE },
  { ie_key: 'FoxNewsArticle', IE: FoxNewsArticleIE },
  { ie_key: 'FoxNewsVideo', IE: FoxNewsVideoIE },
  { ie_key: 'FoxSports', IE: FoxSportsIE },
  { ie_key: 'Fptplay', IE: FptplayIE },
  { ie_key: 'FrancaisFacile', IE: FrancaisFacileIE },
  { ie_key: 'FranceTV', IE: FranceTVIE },
  { ie_key: 'FranceTVInfo', IE: FranceTVInfoIE },
  { ie_key: 'FranceTVSite', IE: FranceTVSiteIE },
  { ie_key: 'Freesound', IE: FreesoundIE },
  { ie_key: 'Freespeech', IE: FreespeechIE },
  { ie_key: 'FreeTv', IE: FreeTvIE },
  { ie_key: 'FreeTvBase', IE: FreeTvBaseIE },
  { ie_key: 'FreeTvMovies', IE: FreeTvMoviesIE },
  { ie_key: 'FrontendMasters', IE: FrontendMastersIE },
  { ie_key: 'FrontendMastersBase', IE: FrontendMastersBaseIE },
  { ie_key: 'FrontendMastersCourse', IE: FrontendMastersCourseIE },
  { ie_key: 'FrontendMastersLesson', IE: FrontendMastersLessonIE },
  { ie_key: 'FrontendMastersPageBase', IE: FrontendMastersPageBaseIE },
  { ie_key: 'FrontoBase', IE: FrontoBaseIE },
  { ie_key: 'FrontroGroupBase', IE: FrontroGroupBaseIE },
  { ie_key: 'FrontroVideoBase', IE: FrontroVideoBaseIE },
  { ie_key: 'Funk', IE: FunkIE },
  { ie_key: 'Funker530', IE: Funker530IE },
  { ie_key: 'Fux', IE: FuxIE },
  { ie_key: 'FuyinTV', IE: FuyinTVIE },
  { ie_key: 'PornerBros', IE: PornerBrosIE },
  { ie_key: 'PornTube', IE: PornTubeIE },
];

export {
  FacebookAdsIE,
  FacebookPluginsVideoIE,
  FacebookRedirectURLIE,
  FancodeLiveIE,
  FancodeVodIE,
  FathomIE,
  FaulioIE,
  FaulioBaseIE,
  FaulioLiveIE,
  FazIE,
  FC2IE,
  FC2EmbedIE,
  FC2LiveIE,
  FczenitIE,
  FifaIE,
  FilmArchivIE,
  FilmOnIE,
  FilmOnChannelIE,
  FilmwebIE,
  FirstTVIE,
  FirstTVLiveIE,
  FiveTVIE,
  FlexTVIE,
  FlickrIE,
  FloatplaneIE,
  FloatplaneBaseIE,
  FloatplaneChannelIE,
  FloatplaneChannelBaseIE,
  FolketingetIE,
  FootyRoomIE,
  Formula1IE,
  FourTubeIE,
  FourTubeBaseIE,
  FOXIE,
  FOX9IE,
  FOX9NewsIE,
  FoxNewsIE,
  FoxNewsArticleIE,
  FoxNewsVideoIE,
  FoxSportsIE,
  FptplayIE,
  FrancaisFacileIE,
  FranceTVIE,
  FranceTVInfoIE,
  FranceTVSiteIE,
  FreesoundIE,
  FreespeechIE,
  FreeTvIE,
  FreeTvBaseIE,
  FreeTvMoviesIE,
  FrontendMastersIE,
  FrontendMastersBaseIE,
  FrontendMastersCourseIE,
  FrontendMastersLessonIE,
  FrontendMastersPageBaseIE,
  FrontoBaseIE,
  FrontroGroupBaseIE,
  FrontroVideoBaseIE,
  FunkIE,
  Funker530IE,
  FuxIE,
  FuyinTVIE,
  PornerBrosIE,
  PornTubeIE,
};
