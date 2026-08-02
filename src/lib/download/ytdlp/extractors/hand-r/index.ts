/**
 * Hand-written batch R (r7 → ruv, skip Reddit) — auto-rebuilt by port/rebuild-hand-r-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { R7IE, R7ArticleIE } from './r7';
import { RadikoIE, RadikoBaseIE, RadikoRadioIE } from './radiko';
import { RadioCanadaIE, RadioCanadaAudioVideoIE } from './radiocanada';
import { RadioDeIE } from './radiode';
import { FranceCultureIE, RadioFranceIE, RadioFranceBaseIE, RadioFranceLiveIE, RadioFrancePlaylistBaseIE, RadioFrancePodcastIE, RadioFranceProfileIE, RadioFranceProgramScheduleIE } from './radiofrance';
import { RadioJavanIE } from './radiojavan';
import { RadioKapitalIE, RadioKapitalBaseIE, RadioKapitalShowIE } from './radiokapital';
import { RadioRadicaleIE } from './radioradicale';
import { RadioZetPodcastIE } from './radiozet';
import { RadLiveIE, RadLiveChannelIE, RadLiveSeasonIE } from './radlive';
import { RaiIE, RaiBaseIE, RaiCulturaIE, RaiNewsIE, RaiPlayIE, RaiPlayLiveIE, RaiPlayPlaylistIE, RaiPlaySoundIE, RaiPlaySoundLiveIE, RaiPlaySoundPlaylistIE, RaiSudtirolIE } from './rai';
import { RayWenderlichIE, RayWenderlichCourseIE } from './raywenderlich';
import { RbgTumIE, RbgTumCourseIE, RbgTumNewCourseIE } from './rbgtum';
import { RCSIE, RCSBaseIE, RCSEmbedsIE, RCSVariousIE } from './rcs';
import { RCTIPlusIE, RCTIPlusBaseIE, RCTIPlusSeriesIE, RCTIPlusTVIE } from './rcti';
import { RDSIE } from './rds';
import { ParliamentLiveUKIE, RedBeeBaseIE, RTBFIE } from './redbee';
import { RedBullIE, RedBullEmbedIE, RedBullTVIE, RedBullTVRrnContentIE } from './redbulltv';
import { RedGifsIE, RedGifsBaseIE, RedGifsSearchIE, RedGifsUserIE } from './redgifs';
import { RedTubeIE } from './redtube';
import { RENTVIE, RENTVArticleIE } from './rentv';
import { RestudyIE } from './restudy';
import { ReutersIE } from './reuters';
import { ReverbNationIE } from './reverbnation';
import { RideHomeIE } from './ridehome';
import { RinseFMIE, RinseFMArtistPlaylistIE, RinseFMBaseIE } from './rinsefm';
import { RockstarGamesIE } from './rockstargames';
import { RokfinIE, RokfinChannelIE, RokfinPlaylistBaseIE, RokfinSearchIE, RokfinStackIE } from './rokfin';
import { RoosterTeethIE, RoosterTeethBaseIE, RoosterTeethSeriesIE } from './roosterteeth';
import { RottenTomatoesIE } from './rottentomatoes';
import { RoyaLiveIE } from './roya';
import { MujRozhlasIE, RozhlasIE, RozhlasBaseIE, RozhlasVltavaIE } from './rozhlas';
import { RteIE, RteBaseIE, RteRadioIE } from './rte';
import { RTL2IE } from './rtl2';
import { RTLLuArticleIE, RTLLuBaseIE, RTLLuLiveIE, RTLLuRadioIE, RTLLuTeleVODIE, RtlNlIE } from './rtlnl';
import { RTDocumentryIE, RTDocumentryPlaylistIE, RTNewsIE, RuptlyIE } from './rtnews';
import { RTPIE } from './rtp';
import { RTRFMIE } from './rtrfm';
import { RTSIE } from './rts';
import { RTVCKalturaIE, RTVCPlayIE, RTVCPlayBaseIE, RTVCPlayEmbedIE } from './rtvcplay';
import { RTVEALaCartaIE, RTVEAudioIE, RTVEBaseIE, RTVELiveIE, RTVEProgramIE, RTVETelevisionIE } from './rtve';
import { RTVSIE } from './rtvs';
import { RTVSLOIE, RTVSLOShowIE } from './rtvslo';
import { RudoVideoIE } from './rudovideo';
import { Rule34VideoIE } from './rule34video';
import { RumbleIE, RumbleChannelIE, RumbleEmbedIE } from './rumble';
import { RutubeIE, RutubeBaseIE, RutubeChannelIE, RutubeEmbedIE, RutubeMovieIE, RutubePersonIE, RutubePlaylistIE, RutubePlaylistBaseIE, RutubeTagsIE } from './rutube';
import { RuutuIE } from './ruutu';
import { RuvIE, RuvSpilaIE } from './ruv';

export type HandREntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_R_IES: HandREntry[] = [
  { ie_key: 'FranceCulture', IE: FranceCultureIE },
  { ie_key: 'MujRozhlas', IE: MujRozhlasIE },
  { ie_key: 'ParliamentLiveUK', IE: ParliamentLiveUKIE },
  { ie_key: 'R7', IE: R7IE },
  { ie_key: 'R7Article', IE: R7ArticleIE },
  { ie_key: 'Radiko', IE: RadikoIE },
  { ie_key: 'RadikoBase', IE: RadikoBaseIE },
  { ie_key: 'RadikoRadio', IE: RadikoRadioIE },
  { ie_key: 'RadioCanada', IE: RadioCanadaIE },
  { ie_key: 'RadioCanadaAudioVideo', IE: RadioCanadaAudioVideoIE },
  { ie_key: 'RadioDe', IE: RadioDeIE },
  { ie_key: 'RadioFrance', IE: RadioFranceIE },
  { ie_key: 'RadioFranceBase', IE: RadioFranceBaseIE },
  { ie_key: 'RadioFranceLive', IE: RadioFranceLiveIE },
  { ie_key: 'RadioFrancePlaylistBase', IE: RadioFrancePlaylistBaseIE },
  { ie_key: 'RadioFrancePodcast', IE: RadioFrancePodcastIE },
  { ie_key: 'RadioFranceProfile', IE: RadioFranceProfileIE },
  { ie_key: 'RadioFranceProgramSchedule', IE: RadioFranceProgramScheduleIE },
  { ie_key: 'RadioJavan', IE: RadioJavanIE },
  { ie_key: 'RadioKapital', IE: RadioKapitalIE },
  { ie_key: 'RadioKapitalBase', IE: RadioKapitalBaseIE },
  { ie_key: 'RadioKapitalShow', IE: RadioKapitalShowIE },
  { ie_key: 'RadioRadicale', IE: RadioRadicaleIE },
  { ie_key: 'RadioZetPodcast', IE: RadioZetPodcastIE },
  { ie_key: 'RadLive', IE: RadLiveIE },
  { ie_key: 'RadLiveChannel', IE: RadLiveChannelIE },
  { ie_key: 'RadLiveSeason', IE: RadLiveSeasonIE },
  { ie_key: 'Rai', IE: RaiIE },
  { ie_key: 'RaiBase', IE: RaiBaseIE },
  { ie_key: 'RaiCultura', IE: RaiCulturaIE },
  { ie_key: 'RaiNews', IE: RaiNewsIE },
  { ie_key: 'RaiPlay', IE: RaiPlayIE },
  { ie_key: 'RaiPlayLive', IE: RaiPlayLiveIE },
  { ie_key: 'RaiPlayPlaylist', IE: RaiPlayPlaylistIE },
  { ie_key: 'RaiPlaySound', IE: RaiPlaySoundIE },
  { ie_key: 'RaiPlaySoundLive', IE: RaiPlaySoundLiveIE },
  { ie_key: 'RaiPlaySoundPlaylist', IE: RaiPlaySoundPlaylistIE },
  { ie_key: 'RaiSudtirol', IE: RaiSudtirolIE },
  { ie_key: 'RayWenderlich', IE: RayWenderlichIE },
  { ie_key: 'RayWenderlichCourse', IE: RayWenderlichCourseIE },
  { ie_key: 'RbgTum', IE: RbgTumIE },
  { ie_key: 'RbgTumCourse', IE: RbgTumCourseIE },
  { ie_key: 'RbgTumNewCourse', IE: RbgTumNewCourseIE },
  { ie_key: 'RCS', IE: RCSIE },
  { ie_key: 'RCSBase', IE: RCSBaseIE },
  { ie_key: 'RCSEmbeds', IE: RCSEmbedsIE },
  { ie_key: 'RCSVarious', IE: RCSVariousIE },
  { ie_key: 'RCTIPlus', IE: RCTIPlusIE },
  { ie_key: 'RCTIPlusBase', IE: RCTIPlusBaseIE },
  { ie_key: 'RCTIPlusSeries', IE: RCTIPlusSeriesIE },
  { ie_key: 'RCTIPlusTV', IE: RCTIPlusTVIE },
  { ie_key: 'RDS', IE: RDSIE },
  { ie_key: 'RedBeeBase', IE: RedBeeBaseIE },
  { ie_key: 'RedBull', IE: RedBullIE },
  { ie_key: 'RedBullEmbed', IE: RedBullEmbedIE },
  { ie_key: 'RedBullTV', IE: RedBullTVIE },
  { ie_key: 'RedBullTVRrnContent', IE: RedBullTVRrnContentIE },
  { ie_key: 'RedGifs', IE: RedGifsIE },
  { ie_key: 'RedGifsBase', IE: RedGifsBaseIE },
  { ie_key: 'RedGifsSearch', IE: RedGifsSearchIE },
  { ie_key: 'RedGifsUser', IE: RedGifsUserIE },
  { ie_key: 'RedTube', IE: RedTubeIE },
  { ie_key: 'RENTV', IE: RENTVIE },
  { ie_key: 'RENTVArticle', IE: RENTVArticleIE },
  { ie_key: 'Restudy', IE: RestudyIE },
  { ie_key: 'Reuters', IE: ReutersIE },
  { ie_key: 'ReverbNation', IE: ReverbNationIE },
  { ie_key: 'RideHome', IE: RideHomeIE },
  { ie_key: 'RinseFM', IE: RinseFMIE },
  { ie_key: 'RinseFMArtistPlaylist', IE: RinseFMArtistPlaylistIE },
  { ie_key: 'RinseFMBase', IE: RinseFMBaseIE },
  { ie_key: 'RockstarGames', IE: RockstarGamesIE },
  { ie_key: 'Rokfin', IE: RokfinIE },
  { ie_key: 'RokfinChannel', IE: RokfinChannelIE },
  { ie_key: 'RokfinPlaylistBase', IE: RokfinPlaylistBaseIE },
  { ie_key: 'RokfinSearch', IE: RokfinSearchIE },
  { ie_key: 'RokfinStack', IE: RokfinStackIE },
  { ie_key: 'RoosterTeeth', IE: RoosterTeethIE },
  { ie_key: 'RoosterTeethBase', IE: RoosterTeethBaseIE },
  { ie_key: 'RoosterTeethSeries', IE: RoosterTeethSeriesIE },
  { ie_key: 'RottenTomatoes', IE: RottenTomatoesIE },
  { ie_key: 'RoyaLive', IE: RoyaLiveIE },
  { ie_key: 'Rozhlas', IE: RozhlasIE },
  { ie_key: 'RozhlasBase', IE: RozhlasBaseIE },
  { ie_key: 'RozhlasVltava', IE: RozhlasVltavaIE },
  { ie_key: 'RTBF', IE: RTBFIE },
  { ie_key: 'RTDocumentry', IE: RTDocumentryIE },
  { ie_key: 'RTDocumentryPlaylist', IE: RTDocumentryPlaylistIE },
  { ie_key: 'Rte', IE: RteIE },
  { ie_key: 'RteBase', IE: RteBaseIE },
  { ie_key: 'RteRadio', IE: RteRadioIE },
  { ie_key: 'RTL2', IE: RTL2IE },
  { ie_key: 'RTLLuArticle', IE: RTLLuArticleIE },
  { ie_key: 'RTLLuBase', IE: RTLLuBaseIE },
  { ie_key: 'RTLLuLive', IE: RTLLuLiveIE },
  { ie_key: 'RTLLuRadio', IE: RTLLuRadioIE },
  { ie_key: 'RTLLuTeleVOD', IE: RTLLuTeleVODIE },
  { ie_key: 'RtlNl', IE: RtlNlIE },
  { ie_key: 'RTNews', IE: RTNewsIE },
  { ie_key: 'RTP', IE: RTPIE },
  { ie_key: 'RTRFM', IE: RTRFMIE },
  { ie_key: 'RTS', IE: RTSIE },
  { ie_key: 'RTVCKaltura', IE: RTVCKalturaIE },
  { ie_key: 'RTVCPlay', IE: RTVCPlayIE },
  { ie_key: 'RTVCPlayBase', IE: RTVCPlayBaseIE },
  { ie_key: 'RTVCPlayEmbed', IE: RTVCPlayEmbedIE },
  { ie_key: 'RTVEALaCarta', IE: RTVEALaCartaIE },
  { ie_key: 'RTVEAudio', IE: RTVEAudioIE },
  { ie_key: 'RTVEBase', IE: RTVEBaseIE },
  { ie_key: 'RTVELive', IE: RTVELiveIE },
  { ie_key: 'RTVEProgram', IE: RTVEProgramIE },
  { ie_key: 'RTVETelevision', IE: RTVETelevisionIE },
  { ie_key: 'RTVS', IE: RTVSIE },
  { ie_key: 'RTVSLO', IE: RTVSLOIE },
  { ie_key: 'RTVSLOShow', IE: RTVSLOShowIE },
  { ie_key: 'RudoVideo', IE: RudoVideoIE },
  { ie_key: 'Rule34Video', IE: Rule34VideoIE },
  { ie_key: 'Rumble', IE: RumbleIE },
  { ie_key: 'RumbleChannel', IE: RumbleChannelIE },
  { ie_key: 'RumbleEmbed', IE: RumbleEmbedIE },
  { ie_key: 'Ruptly', IE: RuptlyIE },
  { ie_key: 'Rutube', IE: RutubeIE },
  { ie_key: 'RutubeBase', IE: RutubeBaseIE },
  { ie_key: 'RutubeChannel', IE: RutubeChannelIE },
  { ie_key: 'RutubeEmbed', IE: RutubeEmbedIE },
  { ie_key: 'RutubeMovie', IE: RutubeMovieIE },
  { ie_key: 'RutubePerson', IE: RutubePersonIE },
  { ie_key: 'RutubePlaylist', IE: RutubePlaylistIE },
  { ie_key: 'RutubePlaylistBase', IE: RutubePlaylistBaseIE },
  { ie_key: 'RutubeTags', IE: RutubeTagsIE },
  { ie_key: 'Ruutu', IE: RuutuIE },
  { ie_key: 'Ruv', IE: RuvIE },
  { ie_key: 'RuvSpila', IE: RuvSpilaIE },
];

export {
  FranceCultureIE,
  MujRozhlasIE,
  ParliamentLiveUKIE,
  R7IE,
  R7ArticleIE,
  RadikoIE,
  RadikoBaseIE,
  RadikoRadioIE,
  RadioCanadaIE,
  RadioCanadaAudioVideoIE,
  RadioDeIE,
  RadioFranceIE,
  RadioFranceBaseIE,
  RadioFranceLiveIE,
  RadioFrancePlaylistBaseIE,
  RadioFrancePodcastIE,
  RadioFranceProfileIE,
  RadioFranceProgramScheduleIE,
  RadioJavanIE,
  RadioKapitalIE,
  RadioKapitalBaseIE,
  RadioKapitalShowIE,
  RadioRadicaleIE,
  RadioZetPodcastIE,
  RadLiveIE,
  RadLiveChannelIE,
  RadLiveSeasonIE,
  RaiIE,
  RaiBaseIE,
  RaiCulturaIE,
  RaiNewsIE,
  RaiPlayIE,
  RaiPlayLiveIE,
  RaiPlayPlaylistIE,
  RaiPlaySoundIE,
  RaiPlaySoundLiveIE,
  RaiPlaySoundPlaylistIE,
  RaiSudtirolIE,
  RayWenderlichIE,
  RayWenderlichCourseIE,
  RbgTumIE,
  RbgTumCourseIE,
  RbgTumNewCourseIE,
  RCSIE,
  RCSBaseIE,
  RCSEmbedsIE,
  RCSVariousIE,
  RCTIPlusIE,
  RCTIPlusBaseIE,
  RCTIPlusSeriesIE,
  RCTIPlusTVIE,
  RDSIE,
  RedBeeBaseIE,
  RedBullIE,
  RedBullEmbedIE,
  RedBullTVIE,
  RedBullTVRrnContentIE,
  RedGifsIE,
  RedGifsBaseIE,
  RedGifsSearchIE,
  RedGifsUserIE,
  RedTubeIE,
  RENTVIE,
  RENTVArticleIE,
  RestudyIE,
  ReutersIE,
  ReverbNationIE,
  RideHomeIE,
  RinseFMIE,
  RinseFMArtistPlaylistIE,
  RinseFMBaseIE,
  RockstarGamesIE,
  RokfinIE,
  RokfinChannelIE,
  RokfinPlaylistBaseIE,
  RokfinSearchIE,
  RokfinStackIE,
  RoosterTeethIE,
  RoosterTeethBaseIE,
  RoosterTeethSeriesIE,
  RottenTomatoesIE,
  RoyaLiveIE,
  RozhlasIE,
  RozhlasBaseIE,
  RozhlasVltavaIE,
  RTBFIE,
  RTDocumentryIE,
  RTDocumentryPlaylistIE,
  RteIE,
  RteBaseIE,
  RteRadioIE,
  RTL2IE,
  RTLLuArticleIE,
  RTLLuBaseIE,
  RTLLuLiveIE,
  RTLLuRadioIE,
  RTLLuTeleVODIE,
  RtlNlIE,
  RTNewsIE,
  RTPIE,
  RTRFMIE,
  RTSIE,
  RTVCKalturaIE,
  RTVCPlayIE,
  RTVCPlayBaseIE,
  RTVCPlayEmbedIE,
  RTVEALaCartaIE,
  RTVEAudioIE,
  RTVEBaseIE,
  RTVELiveIE,
  RTVEProgramIE,
  RTVETelevisionIE,
  RTVSIE,
  RTVSLOIE,
  RTVSLOShowIE,
  RudoVideoIE,
  Rule34VideoIE,
  RumbleIE,
  RumbleChannelIE,
  RumbleEmbedIE,
  RuptlyIE,
  RutubeIE,
  RutubeBaseIE,
  RutubeChannelIE,
  RutubeEmbedIE,
  RutubeMovieIE,
  RutubePersonIE,
  RutubePlaylistIE,
  RutubePlaylistBaseIE,
  RutubeTagsIE,
  RuutuIE,
  RuvIE,
  RuvSpilaIE,
};
