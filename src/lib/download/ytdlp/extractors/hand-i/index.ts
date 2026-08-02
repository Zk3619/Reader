/**
 * Hand-written batch I (icareus → ixigua) — auto-rebuilt by port/rebuild-hand-i-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { IcareusIE } from './icareus';
import { IchinanaLiveIE, IchinanaLiveClipIE, IchinanaLiveVODIE } from './ichinanalive';
import { IdagioAlbumIE, IdagioPersonalPlaylistIE, IdagioPlaylistIE, IdagioPlaylistBaseIE, IdagioRecordingIE, IdagioTrackIE } from './idagio';
import { IGNIE, IGNArticleIE, IGNBaseIE, IGNVideoIE } from './ign';
import { IHeartRadioIE, IHeartRadioBaseIE, IHeartRadioPodcastIE } from './iheart';
import { IlPostIE } from './ilpost';
import { IltalehtiIE } from './iltalehti';
import { ImdbIE, ImdbListIE } from './imdb';
import { ImgGamingBaseIE } from './imggaming';
import { ImgurIE, ImgurAlbumIE, ImgurBaseIE, ImgurGalleryIE, ImgurGalleryBaseIE } from './imgur';
import { InaIE } from './ina';
import { IncIE } from './inc';
import { IndavideoEmbedIE } from './indavideo';
import { InfoQIE } from './infoq';
import { InstagramBaseIE, InstagramIOSIE, InstagramPlaylistBaseIE, InstagramStoryIE, InstagramTagIE, InstagramUserIE } from './instagram';
import { InternazionaleIE } from './internazionale';
import { IPrimaIE, IPrimaCNNIE } from './iprima';
import { IqIE, IqAlbumIE } from './iqiyi-extra';
import { IslamChannelIE, IslamChannelSeriesIE } from './islamchannel';
import { IsraelNationalNewsIE } from './israelnationalnews';
import { ITProTVIE, ITProTVBaseIE, ITProTVCourseIE } from './itprotv';
import { ITVIE, ITVBTCCIE } from './itv';
import { IviIE, IviCompilationIE } from './ivi';
import { IvideonIE } from './ivideon';
import { IvooxIE } from './ivoox';
import { IwaraIE, IwaraBaseIE, IwaraPlaylistIE, IwaraUserIE } from './iwara';
import { IxiguaIE } from './ixigua';

export type HandIEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_I_IES: HandIEntry[] = [
  { ie_key: 'Icareus', IE: IcareusIE },
  { ie_key: 'IchinanaLive', IE: IchinanaLiveIE },
  { ie_key: 'IchinanaLiveClip', IE: IchinanaLiveClipIE },
  { ie_key: 'IchinanaLiveVOD', IE: IchinanaLiveVODIE },
  { ie_key: 'IdagioAlbum', IE: IdagioAlbumIE },
  { ie_key: 'IdagioPersonalPlaylist', IE: IdagioPersonalPlaylistIE },
  { ie_key: 'IdagioPlaylist', IE: IdagioPlaylistIE },
  { ie_key: 'IdagioPlaylistBase', IE: IdagioPlaylistBaseIE },
  { ie_key: 'IdagioRecording', IE: IdagioRecordingIE },
  { ie_key: 'IdagioTrack', IE: IdagioTrackIE },
  { ie_key: 'IGN', IE: IGNIE },
  { ie_key: 'IGNArticle', IE: IGNArticleIE },
  { ie_key: 'IGNBase', IE: IGNBaseIE },
  { ie_key: 'IGNVideo', IE: IGNVideoIE },
  { ie_key: 'IHeartRadio', IE: IHeartRadioIE },
  { ie_key: 'IHeartRadioBase', IE: IHeartRadioBaseIE },
  { ie_key: 'IHeartRadioPodcast', IE: IHeartRadioPodcastIE },
  { ie_key: 'IlPost', IE: IlPostIE },
  { ie_key: 'Iltalehti', IE: IltalehtiIE },
  { ie_key: 'Imdb', IE: ImdbIE },
  { ie_key: 'ImdbList', IE: ImdbListIE },
  { ie_key: 'ImgGamingBase', IE: ImgGamingBaseIE },
  { ie_key: 'Imgur', IE: ImgurIE },
  { ie_key: 'ImgurAlbum', IE: ImgurAlbumIE },
  { ie_key: 'ImgurBase', IE: ImgurBaseIE },
  { ie_key: 'ImgurGallery', IE: ImgurGalleryIE },
  { ie_key: 'ImgurGalleryBase', IE: ImgurGalleryBaseIE },
  { ie_key: 'Ina', IE: InaIE },
  { ie_key: 'Inc', IE: IncIE },
  { ie_key: 'IndavideoEmbed', IE: IndavideoEmbedIE },
  { ie_key: 'InfoQ', IE: InfoQIE },
  { ie_key: 'InstagramBase', IE: InstagramBaseIE },
  { ie_key: 'InstagramIOS', IE: InstagramIOSIE },
  { ie_key: 'InstagramPlaylistBase', IE: InstagramPlaylistBaseIE },
  { ie_key: 'InstagramStory', IE: InstagramStoryIE },
  { ie_key: 'InstagramTag', IE: InstagramTagIE },
  { ie_key: 'InstagramUser', IE: InstagramUserIE },
  { ie_key: 'Internazionale', IE: InternazionaleIE },
  { ie_key: 'IPrima', IE: IPrimaIE },
  { ie_key: 'IPrimaCNN', IE: IPrimaCNNIE },
  { ie_key: 'Iq', IE: IqIE },
  { ie_key: 'IqAlbum', IE: IqAlbumIE },
  { ie_key: 'IslamChannel', IE: IslamChannelIE },
  { ie_key: 'IslamChannelSeries', IE: IslamChannelSeriesIE },
  { ie_key: 'IsraelNationalNews', IE: IsraelNationalNewsIE },
  { ie_key: 'ITProTV', IE: ITProTVIE },
  { ie_key: 'ITProTVBase', IE: ITProTVBaseIE },
  { ie_key: 'ITProTVCourse', IE: ITProTVCourseIE },
  { ie_key: 'ITV', IE: ITVIE },
  { ie_key: 'ITVBTCC', IE: ITVBTCCIE },
  { ie_key: 'Ivi', IE: IviIE },
  { ie_key: 'IviCompilation', IE: IviCompilationIE },
  { ie_key: 'Ivideon', IE: IvideonIE },
  { ie_key: 'Ivoox', IE: IvooxIE },
  { ie_key: 'Iwara', IE: IwaraIE },
  { ie_key: 'IwaraBase', IE: IwaraBaseIE },
  { ie_key: 'IwaraPlaylist', IE: IwaraPlaylistIE },
  { ie_key: 'IwaraUser', IE: IwaraUserIE },
  { ie_key: 'Ixigua', IE: IxiguaIE },
];

export {
  IcareusIE,
  IchinanaLiveIE,
  IchinanaLiveClipIE,
  IchinanaLiveVODIE,
  IdagioAlbumIE,
  IdagioPersonalPlaylistIE,
  IdagioPlaylistIE,
  IdagioPlaylistBaseIE,
  IdagioRecordingIE,
  IdagioTrackIE,
  IGNIE,
  IGNArticleIE,
  IGNBaseIE,
  IGNVideoIE,
  IHeartRadioIE,
  IHeartRadioBaseIE,
  IHeartRadioPodcastIE,
  IlPostIE,
  IltalehtiIE,
  ImdbIE,
  ImdbListIE,
  ImgGamingBaseIE,
  ImgurIE,
  ImgurAlbumIE,
  ImgurBaseIE,
  ImgurGalleryIE,
  ImgurGalleryBaseIE,
  InaIE,
  IncIE,
  IndavideoEmbedIE,
  InfoQIE,
  InstagramBaseIE,
  InstagramIOSIE,
  InstagramPlaylistBaseIE,
  InstagramStoryIE,
  InstagramTagIE,
  InstagramUserIE,
  InternazionaleIE,
  IPrimaIE,
  IPrimaCNNIE,
  IqIE,
  IqAlbumIE,
  IslamChannelIE,
  IslamChannelSeriesIE,
  IsraelNationalNewsIE,
  ITProTVIE,
  ITProTVBaseIE,
  ITProTVCourseIE,
  ITVIE,
  ITVBTCCIE,
  IviIE,
  IviCompilationIE,
  IvideonIE,
  IvooxIE,
  IwaraIE,
  IwaraBaseIE,
  IwaraPlaylistIE,
  IwaraUserIE,
  IxiguaIE,
};
