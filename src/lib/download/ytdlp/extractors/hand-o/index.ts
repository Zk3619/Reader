/**
 * Hand-written batch O (odkmedia → owncloud) — auto-rebuilt by port/rebuild-hand-o-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { OnDemandChinaEpisodeIE } from './odkmedia';
import { OdnoklassnikiIE } from './odnoklassniki';
import { OfTVIE, OfTVPlaylistIE } from './oftv';
import { OktoberfestTVIE } from './oktoberfesttv';
import { OlympicsReplayIE } from './olympics';
import { OmnyfmIE, OmnyfmPlaylistIE, OmnyfmPlaylistBaseIE, OmnyfmShowIE } from './omnyfm';
import { On24IE } from './on24';
import { OnDemandKoreaIE, OnDemandKoreaProgramIE } from './ondemandkorea';
import { OneFootballIE } from './onefootball';
import { OneNewsNZIE } from './onenewsnz';
import { OnePlacePodcastIE } from './oneplace';
import { OnetIE, OnetBaseIE, OnetChannelIE, OnetMVPIE, OnetPlIE } from './onet';
import { OnsenIE } from './onsen';
import { OpencastIE, OpencastBaseIE, OpencastPlaylistIE } from './opencast';
import { OpenRecIE, OpenRecBaseIE, OpenRecCaptureIE, OpenRecChannelIE, OpenRecChannelSearchIE, OpenRecMovieIE, OpenRecPlaylistIE } from './openrec';
import { ORFFM4StoryIE, ORFIPTVIE, ORFONIE, ORFPodcastIE, ORFRadioIE } from './orf';
import { OutsideTVIE } from './outsidetv';
import { OwnCloudIE } from './owncloud';

export type HandOEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_O_IES: HandOEntry[] = [
  { ie_key: 'Odnoklassniki', IE: OdnoklassnikiIE },
  { ie_key: 'OfTV', IE: OfTVIE },
  { ie_key: 'OfTVPlaylist', IE: OfTVPlaylistIE },
  { ie_key: 'OktoberfestTV', IE: OktoberfestTVIE },
  { ie_key: 'OlympicsReplay', IE: OlympicsReplayIE },
  { ie_key: 'Omnyfm', IE: OmnyfmIE },
  { ie_key: 'OmnyfmPlaylist', IE: OmnyfmPlaylistIE },
  { ie_key: 'OmnyfmPlaylistBase', IE: OmnyfmPlaylistBaseIE },
  { ie_key: 'OmnyfmShow', IE: OmnyfmShowIE },
  { ie_key: 'On24', IE: On24IE },
  { ie_key: 'OnDemandChinaEpisode', IE: OnDemandChinaEpisodeIE },
  { ie_key: 'OnDemandKorea', IE: OnDemandKoreaIE },
  { ie_key: 'OnDemandKoreaProgram', IE: OnDemandKoreaProgramIE },
  { ie_key: 'OneFootball', IE: OneFootballIE },
  { ie_key: 'OneNewsNZ', IE: OneNewsNZIE },
  { ie_key: 'OnePlacePodcast', IE: OnePlacePodcastIE },
  { ie_key: 'Onet', IE: OnetIE },
  { ie_key: 'OnetBase', IE: OnetBaseIE },
  { ie_key: 'OnetChannel', IE: OnetChannelIE },
  { ie_key: 'OnetMVP', IE: OnetMVPIE },
  { ie_key: 'OnetPl', IE: OnetPlIE },
  { ie_key: 'Onsen', IE: OnsenIE },
  { ie_key: 'Opencast', IE: OpencastIE },
  { ie_key: 'OpencastBase', IE: OpencastBaseIE },
  { ie_key: 'OpencastPlaylist', IE: OpencastPlaylistIE },
  { ie_key: 'OpenRec', IE: OpenRecIE },
  { ie_key: 'OpenRecBase', IE: OpenRecBaseIE },
  { ie_key: 'OpenRecCapture', IE: OpenRecCaptureIE },
  { ie_key: 'OpenRecChannel', IE: OpenRecChannelIE },
  { ie_key: 'OpenRecChannelSearch', IE: OpenRecChannelSearchIE },
  { ie_key: 'OpenRecMovie', IE: OpenRecMovieIE },
  { ie_key: 'OpenRecPlaylist', IE: OpenRecPlaylistIE },
  { ie_key: 'ORFFM4Story', IE: ORFFM4StoryIE },
  { ie_key: 'ORFIPTV', IE: ORFIPTVIE },
  { ie_key: 'ORFON', IE: ORFONIE },
  { ie_key: 'ORFPodcast', IE: ORFPodcastIE },
  { ie_key: 'ORFRadio', IE: ORFRadioIE },
  { ie_key: 'OutsideTV', IE: OutsideTVIE },
  { ie_key: 'OwnCloud', IE: OwnCloudIE },
];

export {
  OdnoklassnikiIE,
  OfTVIE,
  OfTVPlaylistIE,
  OktoberfestTVIE,
  OlympicsReplayIE,
  OmnyfmIE,
  OmnyfmPlaylistIE,
  OmnyfmPlaylistBaseIE,
  OmnyfmShowIE,
  On24IE,
  OnDemandChinaEpisodeIE,
  OnDemandKoreaIE,
  OnDemandKoreaProgramIE,
  OneFootballIE,
  OneNewsNZIE,
  OnePlacePodcastIE,
  OnetIE,
  OnetBaseIE,
  OnetChannelIE,
  OnetMVPIE,
  OnetPlIE,
  OnsenIE,
  OpencastIE,
  OpencastBaseIE,
  OpencastPlaylistIE,
  OpenRecIE,
  OpenRecBaseIE,
  OpenRecCaptureIE,
  OpenRecChannelIE,
  OpenRecChannelSearchIE,
  OpenRecMovieIE,
  OpenRecPlaylistIE,
  ORFFM4StoryIE,
  ORFIPTVIE,
  ORFONIE,
  ORFPodcastIE,
  ORFRadioIE,
  OutsideTVIE,
  OwnCloudIE,
};
