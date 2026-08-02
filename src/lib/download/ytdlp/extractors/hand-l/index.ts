/**
 * Hand-written batch L (la7 → lumni) — auto-rebuilt by port/rebuild-hand-l-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { LA7IE, LA7PodcastIE, LA7PodcastEpisodeIE } from './la7';
import { LaracastsIE, LaracastsBaseIE, LaracastsPlaylistIE } from './laracasts';
import { LastFMIE, LastFMPlaylistIE, LastFMPlaylistBaseIE, LastFMUserIE } from './lastfm';
import { LaXarxaMesIE } from './laxarxames';
import { LBRYIE, LBRYBaseIE, LBRYChannelIE, LBRYPlaylistIE } from './lbry';
import { LCIIE } from './lci';
import { LcpIE, LcpPlayIE } from './lcp';
import { LearningOnScreenIE } from './learningonscreen';
import { Lecture2GoIE } from './lecture2go';
import { LecturioIE, LecturioBaseIE, LecturioCourseIE, LecturioDeCourseIE } from './lecturio';
import { LeIE, LePlaylistIE } from './leeco';
import { LeFigaroVideoEmbedIE, LeFigaroVideoSectionIE } from './lefigaro';
import { LEGOIE } from './lego';
import { LemondeIE } from './lemonde';
import { LentaIE } from './lenta';
import { LibraryOfCongressIE } from './libraryofcongress';
import { LibsynIE } from './libsyn';
import { LifeEmbedIE, LifeNewsIE } from './lifenews';
import { LikeeIE, LikeeUserIE } from './likee';
import { LinkedInIE, LinkedInEventsIE, LinkedInLearningIE, LinkedInLearningBaseIE, LinkedInLearningCourseIE } from './linkedin';
import { Liputan6IE } from './liputan6';
import { ListenNotesIE } from './listennotes';
import { LiTVIE } from './litv';
import { LiveJournalIE } from './livejournal';
import { LivestreamfailsIE } from './livestreamfails';
import { LnkIE } from './lnk';
import { LocipoIE, LocipoBaseIE, LocipoPlaylistIE } from './locipo';
import { LocoIE } from './loco';
import { LoomIE, LoomFolderIE } from './loom';
import { LoveHomePornIE } from './lovehomeporn';
import { LRTRadioIE, LRTStreamIE, LRTVODIE } from './lrt';
import { LSMLREmbedIE, LSMLTVEmbedIE, LSMReplayIE } from './lsm';
import { LumniIE } from './lumni';

export type HandLEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_L_IES: HandLEntry[] = [
  { ie_key: 'LA7', IE: LA7IE },
  { ie_key: 'LA7Podcast', IE: LA7PodcastIE },
  { ie_key: 'LA7PodcastEpisode', IE: LA7PodcastEpisodeIE },
  { ie_key: 'Laracasts', IE: LaracastsIE },
  { ie_key: 'LaracastsBase', IE: LaracastsBaseIE },
  { ie_key: 'LaracastsPlaylist', IE: LaracastsPlaylistIE },
  { ie_key: 'LastFM', IE: LastFMIE },
  { ie_key: 'LastFMPlaylist', IE: LastFMPlaylistIE },
  { ie_key: 'LastFMPlaylistBase', IE: LastFMPlaylistBaseIE },
  { ie_key: 'LastFMUser', IE: LastFMUserIE },
  { ie_key: 'LaXarxaMes', IE: LaXarxaMesIE },
  { ie_key: 'LBRY', IE: LBRYIE },
  { ie_key: 'LBRYBase', IE: LBRYBaseIE },
  { ie_key: 'LBRYChannel', IE: LBRYChannelIE },
  { ie_key: 'LBRYPlaylist', IE: LBRYPlaylistIE },
  { ie_key: 'LCI', IE: LCIIE },
  { ie_key: 'Lcp', IE: LcpIE },
  { ie_key: 'LcpPlay', IE: LcpPlayIE },
  { ie_key: 'Le', IE: LeIE },
  { ie_key: 'LearningOnScreen', IE: LearningOnScreenIE },
  { ie_key: 'Lecture2Go', IE: Lecture2GoIE },
  { ie_key: 'Lecturio', IE: LecturioIE },
  { ie_key: 'LecturioBase', IE: LecturioBaseIE },
  { ie_key: 'LecturioCourse', IE: LecturioCourseIE },
  { ie_key: 'LecturioDeCourse', IE: LecturioDeCourseIE },
  { ie_key: 'LeFigaroVideoEmbed', IE: LeFigaroVideoEmbedIE },
  { ie_key: 'LeFigaroVideoSection', IE: LeFigaroVideoSectionIE },
  { ie_key: 'LEGO', IE: LEGOIE },
  { ie_key: 'Lemonde', IE: LemondeIE },
  { ie_key: 'Lenta', IE: LentaIE },
  { ie_key: 'LePlaylist', IE: LePlaylistIE },
  { ie_key: 'LibraryOfCongress', IE: LibraryOfCongressIE },
  { ie_key: 'Libsyn', IE: LibsynIE },
  { ie_key: 'LifeEmbed', IE: LifeEmbedIE },
  { ie_key: 'LifeNews', IE: LifeNewsIE },
  { ie_key: 'Likee', IE: LikeeIE },
  { ie_key: 'LikeeUser', IE: LikeeUserIE },
  { ie_key: 'LinkedIn', IE: LinkedInIE },
  { ie_key: 'LinkedInEvents', IE: LinkedInEventsIE },
  { ie_key: 'LinkedInLearning', IE: LinkedInLearningIE },
  { ie_key: 'LinkedInLearningBase', IE: LinkedInLearningBaseIE },
  { ie_key: 'LinkedInLearningCourse', IE: LinkedInLearningCourseIE },
  { ie_key: 'Liputan6', IE: Liputan6IE },
  { ie_key: 'ListenNotes', IE: ListenNotesIE },
  { ie_key: 'LiTV', IE: LiTVIE },
  { ie_key: 'LiveJournal', IE: LiveJournalIE },
  { ie_key: 'Livestreamfails', IE: LivestreamfailsIE },
  { ie_key: 'Lnk', IE: LnkIE },
  { ie_key: 'Locipo', IE: LocipoIE },
  { ie_key: 'LocipoBase', IE: LocipoBaseIE },
  { ie_key: 'LocipoPlaylist', IE: LocipoPlaylistIE },
  { ie_key: 'Loco', IE: LocoIE },
  { ie_key: 'Loom', IE: LoomIE },
  { ie_key: 'LoomFolder', IE: LoomFolderIE },
  { ie_key: 'LoveHomePorn', IE: LoveHomePornIE },
  { ie_key: 'LRTRadio', IE: LRTRadioIE },
  { ie_key: 'LRTStream', IE: LRTStreamIE },
  { ie_key: 'LRTVOD', IE: LRTVODIE },
  { ie_key: 'LSMLREmbed', IE: LSMLREmbedIE },
  { ie_key: 'LSMLTVEmbed', IE: LSMLTVEmbedIE },
  { ie_key: 'LSMReplay', IE: LSMReplayIE },
  { ie_key: 'Lumni', IE: LumniIE },
];

export {
  LA7IE,
  LA7PodcastIE,
  LA7PodcastEpisodeIE,
  LaracastsIE,
  LaracastsBaseIE,
  LaracastsPlaylistIE,
  LastFMIE,
  LastFMPlaylistIE,
  LastFMPlaylistBaseIE,
  LastFMUserIE,
  LaXarxaMesIE,
  LBRYIE,
  LBRYBaseIE,
  LBRYChannelIE,
  LBRYPlaylistIE,
  LCIIE,
  LcpIE,
  LcpPlayIE,
  LeIE,
  LearningOnScreenIE,
  Lecture2GoIE,
  LecturioIE,
  LecturioBaseIE,
  LecturioCourseIE,
  LecturioDeCourseIE,
  LeFigaroVideoEmbedIE,
  LeFigaroVideoSectionIE,
  LEGOIE,
  LemondeIE,
  LentaIE,
  LePlaylistIE,
  LibraryOfCongressIE,
  LibsynIE,
  LifeEmbedIE,
  LifeNewsIE,
  LikeeIE,
  LikeeUserIE,
  LinkedInIE,
  LinkedInEventsIE,
  LinkedInLearningIE,
  LinkedInLearningBaseIE,
  LinkedInLearningCourseIE,
  Liputan6IE,
  ListenNotesIE,
  LiTVIE,
  LiveJournalIE,
  LivestreamfailsIE,
  LnkIE,
  LocipoIE,
  LocipoBaseIE,
  LocipoPlaylistIE,
  LocoIE,
  LoomIE,
  LoomFolderIE,
  LoveHomePornIE,
  LRTRadioIE,
  LRTStreamIE,
  LRTVODIE,
  LSMLREmbedIE,
  LSMLTVEmbedIE,
  LSMReplayIE,
  LumniIE,
};
