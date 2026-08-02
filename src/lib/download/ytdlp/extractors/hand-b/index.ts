/**
 * Hand-written batch B (baidu → byutv) — auto-rebuilt by port/rebuild-hand-b-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { BaiduVideoIE } from './baidu';
import { BanByeIE, BanByeBaseIE, BanByeChannelIE } from './banbye';
import { BandcampIE, BandcampAlbumIE, BandcampUserIE, BandcampWeeklyIE } from './bandcamp';
import { BandlabIE, BandlabBaseIE, BandlabPlaylistIE } from './bandlab';
import { BannedVideoIE } from './bannedvideo';
import { BBCIE, BBCCoUkIE, BBCCoUkArticleIE, BBCCoUkIPlayerEpisodesIE, BBCCoUkIPlayerGroupIE, BBCCoUkIPlayerPlaylistBaseIE, BBCCoUkPlaylistIE, BBCCoUkPlaylistBaseIE } from './bbc';
import { BeaconTvIE } from './beacon';
import { BeatportIE } from './beatport';
import { BeegIE } from './beeg';
import { BehindKinkIE } from './behindkink';
import { BerufeTVIE } from './berufetv';
import { BetIE } from './bet';
import { BFIPlayerIE } from './bfi';
import { BFMTVIE, BFMTVArticleIE, BFMTVBaseIE, BFMTVLiveIE } from './bfmtv';
import { BibelTVBaseIE, BibelTVLiveIE, BibelTVSeriesIE, BibelTVVideoIE } from './bibeltv';
import { BigoIE } from './bigo';
import { BildIE } from './bild';
import { BioBioChileTVIE } from './biobiochiletv';
import { BitChuteIE, BitChuteChannelIE } from './bitchute';
import { BitmovinIE } from './bitmovin';
import { BlackboardCollaborateIE, BlackboardCollaborateLaunchIE } from './blackboardcollaborate';
import { BleacherReportIE, BleacherReportCMSIE } from './bleacherreport';
import { BlerpIE } from './blerp';
import { BloggerIE } from './blogger';
import { BloombergIE } from './bloomberg';
import { BlueskyIE } from './bluesky';
import { BongaCamsIE } from './bongacams';
import { BoostyIE } from './boosty';
import { BostonGlobeIE } from './bostonglobe';
import { BoxIE } from './box';
import { BoxCastVideoIE } from './boxcast';
import { BpbIE } from './bpb';
import { BRIE } from './br';
import { BrainPOPIE, BrainPOPBaseIE, BrainPOPELLIE, BrainPOPEspIE, BrainPOPFrIE, BrainPOPIlIE, BrainPOPJrIE, BrainPOPLegacyBaseIE } from './brainpop';
import { BreitBartIE } from './breitbart';
import { BrilliantpalaBaseIE, BrilliantpalaClassesIE, BrilliantpalaElearnIE } from './brilliantpala';
import { BTVPlusIE } from './btvplus';
import { BundesligaIE } from './bundesliga';
import { BundestagIE } from './bundestag';
import { BunnyCdnIE } from './bunnycdn';
import { BusinessInsiderIE } from './businessinsider';
import { BuzzFeedIE } from './buzzfeed';
import { BYUtvIE } from './byutv';

export type HandBEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_B_IES: HandBEntry[] = [
  { ie_key: 'BaiduVideo', IE: BaiduVideoIE },
  { ie_key: 'BanBye', IE: BanByeIE },
  { ie_key: 'BanByeBase', IE: BanByeBaseIE },
  { ie_key: 'BanByeChannel', IE: BanByeChannelIE },
  { ie_key: 'Bandcamp', IE: BandcampIE },
  { ie_key: 'BandcampAlbum', IE: BandcampAlbumIE },
  { ie_key: 'BandcampUser', IE: BandcampUserIE },
  { ie_key: 'BandcampWeekly', IE: BandcampWeeklyIE },
  { ie_key: 'Bandlab', IE: BandlabIE },
  { ie_key: 'BandlabBase', IE: BandlabBaseIE },
  { ie_key: 'BandlabPlaylist', IE: BandlabPlaylistIE },
  { ie_key: 'BannedVideo', IE: BannedVideoIE },
  { ie_key: 'BBC', IE: BBCIE },
  { ie_key: 'BBCCoUk', IE: BBCCoUkIE },
  { ie_key: 'BBCCoUkArticle', IE: BBCCoUkArticleIE },
  { ie_key: 'BBCCoUkIPlayerEpisodes', IE: BBCCoUkIPlayerEpisodesIE },
  { ie_key: 'BBCCoUkIPlayerGroup', IE: BBCCoUkIPlayerGroupIE },
  { ie_key: 'BBCCoUkIPlayerPlaylistBase', IE: BBCCoUkIPlayerPlaylistBaseIE },
  { ie_key: 'BBCCoUkPlaylist', IE: BBCCoUkPlaylistIE },
  { ie_key: 'BBCCoUkPlaylistBase', IE: BBCCoUkPlaylistBaseIE },
  { ie_key: 'BeaconTv', IE: BeaconTvIE },
  { ie_key: 'Beatport', IE: BeatportIE },
  { ie_key: 'Beeg', IE: BeegIE },
  { ie_key: 'BehindKink', IE: BehindKinkIE },
  { ie_key: 'BerufeTV', IE: BerufeTVIE },
  { ie_key: 'Bet', IE: BetIE },
  { ie_key: 'BFIPlayer', IE: BFIPlayerIE },
  { ie_key: 'BFMTV', IE: BFMTVIE },
  { ie_key: 'BFMTVArticle', IE: BFMTVArticleIE },
  { ie_key: 'BFMTVBase', IE: BFMTVBaseIE },
  { ie_key: 'BFMTVLive', IE: BFMTVLiveIE },
  { ie_key: 'BibelTVBase', IE: BibelTVBaseIE },
  { ie_key: 'BibelTVLive', IE: BibelTVLiveIE },
  { ie_key: 'BibelTVSeries', IE: BibelTVSeriesIE },
  { ie_key: 'BibelTVVideo', IE: BibelTVVideoIE },
  { ie_key: 'Bigo', IE: BigoIE },
  { ie_key: 'Bild', IE: BildIE },
  { ie_key: 'BioBioChileTV', IE: BioBioChileTVIE },
  { ie_key: 'BitChute', IE: BitChuteIE },
  { ie_key: 'BitChuteChannel', IE: BitChuteChannelIE },
  { ie_key: 'Bitmovin', IE: BitmovinIE },
  { ie_key: 'BlackboardCollaborate', IE: BlackboardCollaborateIE },
  { ie_key: 'BlackboardCollaborateLaunch', IE: BlackboardCollaborateLaunchIE },
  { ie_key: 'BleacherReport', IE: BleacherReportIE },
  { ie_key: 'BleacherReportCMS', IE: BleacherReportCMSIE },
  { ie_key: 'Blerp', IE: BlerpIE },
  { ie_key: 'Blogger', IE: BloggerIE },
  { ie_key: 'Bloomberg', IE: BloombergIE },
  { ie_key: 'Bluesky', IE: BlueskyIE },
  { ie_key: 'BongaCams', IE: BongaCamsIE },
  { ie_key: 'Boosty', IE: BoostyIE },
  { ie_key: 'BostonGlobe', IE: BostonGlobeIE },
  { ie_key: 'Box', IE: BoxIE },
  { ie_key: 'BoxCastVideo', IE: BoxCastVideoIE },
  { ie_key: 'Bpb', IE: BpbIE },
  { ie_key: 'BR', IE: BRIE },
  { ie_key: 'BrainPOP', IE: BrainPOPIE },
  { ie_key: 'BrainPOPBase', IE: BrainPOPBaseIE },
  { ie_key: 'BrainPOPELL', IE: BrainPOPELLIE },
  { ie_key: 'BrainPOPEsp', IE: BrainPOPEspIE },
  { ie_key: 'BrainPOPFr', IE: BrainPOPFrIE },
  { ie_key: 'BrainPOPIl', IE: BrainPOPIlIE },
  { ie_key: 'BrainPOPJr', IE: BrainPOPJrIE },
  { ie_key: 'BrainPOPLegacyBase', IE: BrainPOPLegacyBaseIE },
  { ie_key: 'BreitBart', IE: BreitBartIE },
  { ie_key: 'BrilliantpalaBase', IE: BrilliantpalaBaseIE },
  { ie_key: 'BrilliantpalaClasses', IE: BrilliantpalaClassesIE },
  { ie_key: 'BrilliantpalaElearn', IE: BrilliantpalaElearnIE },
  { ie_key: 'BTVPlus', IE: BTVPlusIE },
  { ie_key: 'Bundesliga', IE: BundesligaIE },
  { ie_key: 'Bundestag', IE: BundestagIE },
  { ie_key: 'BunnyCdn', IE: BunnyCdnIE },
  { ie_key: 'BusinessInsider', IE: BusinessInsiderIE },
  { ie_key: 'BuzzFeed', IE: BuzzFeedIE },
  { ie_key: 'BYUtv', IE: BYUtvIE },
];

export {
  BaiduVideoIE,
  BanByeIE,
  BanByeBaseIE,
  BanByeChannelIE,
  BandcampIE,
  BandcampAlbumIE,
  BandcampUserIE,
  BandcampWeeklyIE,
  BandlabIE,
  BandlabBaseIE,
  BandlabPlaylistIE,
  BannedVideoIE,
  BBCIE,
  BBCCoUkIE,
  BBCCoUkArticleIE,
  BBCCoUkIPlayerEpisodesIE,
  BBCCoUkIPlayerGroupIE,
  BBCCoUkIPlayerPlaylistBaseIE,
  BBCCoUkPlaylistIE,
  BBCCoUkPlaylistBaseIE,
  BeaconTvIE,
  BeatportIE,
  BeegIE,
  BehindKinkIE,
  BerufeTVIE,
  BetIE,
  BFIPlayerIE,
  BFMTVIE,
  BFMTVArticleIE,
  BFMTVBaseIE,
  BFMTVLiveIE,
  BibelTVBaseIE,
  BibelTVLiveIE,
  BibelTVSeriesIE,
  BibelTVVideoIE,
  BigoIE,
  BildIE,
  BioBioChileTVIE,
  BitChuteIE,
  BitChuteChannelIE,
  BitmovinIE,
  BlackboardCollaborateIE,
  BlackboardCollaborateLaunchIE,
  BleacherReportIE,
  BleacherReportCMSIE,
  BlerpIE,
  BloggerIE,
  BloombergIE,
  BlueskyIE,
  BongaCamsIE,
  BoostyIE,
  BostonGlobeIE,
  BoxIE,
  BoxCastVideoIE,
  BpbIE,
  BRIE,
  BrainPOPIE,
  BrainPOPBaseIE,
  BrainPOPELLIE,
  BrainPOPEspIE,
  BrainPOPFrIE,
  BrainPOPIlIE,
  BrainPOPJrIE,
  BrainPOPLegacyBaseIE,
  BreitBartIE,
  BrilliantpalaBaseIE,
  BrilliantpalaClassesIE,
  BrilliantpalaElearnIE,
  BTVPlusIE,
  BundesligaIE,
  BundestagIE,
  BunnyCdnIE,
  BusinessInsiderIE,
  BuzzFeedIE,
  BYUtvIE,
};
