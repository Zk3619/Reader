/**
 * 应用图标：基于 lucide-solid，统一 class / size API
 */

import type { Component } from 'solid-js';
import type { LucideProps } from 'lucide-solid';
import {
  CircleAlert,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  ArrowDownRight,
  Book,
  BookMarked,
  BookMinus,
  BookOpen,
  BookPlus,
  Bookmark,
  BookText,
  BookImage,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Circle,
  Clock,
  Dot,
  Download,
  Ellipsis,
  File,
  FileText,
  Film,
  Folder,
  FolderPlus,
  FolderSync,
  FolderTree,
  Globe,
  GripVertical,
  HardDrive,
  History,
  Image,
  Info,
  LayoutGrid,
  LibraryBig,
  Link,
  List,
  ListFilter,
  ListRestart,
  LoaderCircle,
  Minus,
  Monitor,
  Moon,
  Music,
  PanelLeft,
  Plus,
  Pencil,
  Play,
  QrCode,
  ScanQrCode,
  Code,
  RefreshCw,
  Rss,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Square,
  Star,
  Sun,
  SunMoon,
  Upload,
  Users,
  X,
  Maximize,
  Minimize,
  Volume2,
  VolumeOff,
  ChevronUp,
  Cloud,
  Cookie,
  Crown,
  CalendarDays,
  SquareArrowRightEnter,
  SquareArrowRightExit,
  Trash2,
} from 'lucide-solid';

export interface IconProps {
  class?: string;
  size?: number;
}

type LucideIcon = Component<LucideProps>;

function icon(LucideIconComponent: LucideIcon): Component<IconProps> {
  return (props) => (
    <LucideIconComponent
      class={props.class}
      size={props.size ?? 16}
      stroke-width={2}
      aria-hidden
    />
  );
}

/** 书籍封面占位 */
export const BookCoverIcon = icon(BookImage);
export const BookshelfIcon = icon(LibraryBig);
export const BookSourceIcon = icon(BookText);
/** 主导航「订阅」Tab 图标 */
export const RssTabIcon = icon(Rss);
export const RssIcon = icon(Rss);
export const BookmarkIcon = icon(Bookmark);
export const RecordIcon = icon(Clock);
export const SettingsIcon = icon(Settings);
export const StarIcon = icon(Star);
export const ThemeLightIcon = icon(Sun);
export const ThemeDarkIcon = icon(Moon);
/** 跟随系统明暗 */
export const ThemeSystemIcon = icon(Monitor);
/** 按设定时段自动明暗（sun-moon） */
export const ThemeScheduleIcon = icon(SunMoon);
export const AddToShelfIcon = icon(BookPlus);
export const RemoveFromShelfIcon = icon(BookMinus);
export const BookInfoIcon = icon(Info);
export const SearchIcon = icon(Search);
export const FilterIcon = icon(ListFilter);
export const MoreIcon = icon(Ellipsis);
export const RefreshIcon = icon(RefreshCw);
export const ListRefreshIcon = icon(ListRestart);
export const FolderRefreshIcon = icon(FolderSync);
export const FolderPlusIcon = icon(FolderPlus);
export const PlusIcon = icon(Plus);
export const GlobeIcon = icon(Globe);
export const LinkIcon = icon(Link);
export const CookieIcon = icon(Cookie);
export const CrownIcon = icon(Crown);
export const CalendarDaysIcon = icon(CalendarDays);
export const PencilIcon = icon(Pencil);
export const Settings2Icon = icon(SlidersHorizontal);
export const LayoutIcon = icon(LayoutGrid);
export const FolderTreeIcon = icon(FolderTree);
export const DownloadIcon = icon(Download);
export const PlayIcon = icon(Play);
export const SquareIcon = icon(Square);
export const UploadIcon = icon(Upload);
export const ExportIcon = icon(SquareArrowRightExit);
export const ImportIcon = icon(SquareArrowRightEnter);
export const FileTextIcon = icon(FileText);
export const QrCodeIcon = icon(QrCode);
export const ScanQrCodeIcon = icon(ScanQrCode);
export const CodeIcon = icon(Code);
export const ChevronLeftIcon = icon(ChevronLeft);
export const ListIcon = icon(List);
export const ImmersiveIcon = icon(BookOpen);
export const FolderIcon = icon(Folder);
export const FileIcon = icon(File);
export const ChevronRightIcon = icon(ChevronRight);
export const ChevronDownIcon = icon(ChevronDown);
export const LoaderIcon = icon(LoaderCircle);
export const BookOpenIcon = icon(BookOpen);
export const ReplaceIcon = icon(ArrowLeftRight);

/** UI  primitives（shadcn / 通用控件） */
export const XIcon = icon(X);
export const CheckIcon = icon(Check);
export const SaveIcon = icon(Save);
export const MinusIcon = icon(Minus);
export const ChevronsUpDownIcon = icon(ChevronsUpDown);
export const PanelLeftIcon = icon(PanelLeft);
export const GripVerticalIcon = icon(GripVertical);
export const CircleIcon = icon(Circle);
export const AlertCircleIcon = icon(CircleAlert);
export const ImageIcon = icon(Image);

export const MinimizeWindowIcon = icon(Minus);
export const MaximizeWindowIcon = icon(Maximize);
export const RestoreWindowIcon = icon(Minimize);

export const ArrowUpIcon = icon(ArrowUp);
export const ArrowDownIcon = icon(ArrowDown);
export const ArrowLeftIcon = icon(ArrowLeft);
export const ArrowRightIcon = icon(ArrowRight);

export const ArrowUpRightIcon = icon(ArrowUpRight);
export const ArrowDownRightIcon = icon(ArrowDownRight);

/** 单选指示圆点（菜单/ RadioGroup） */
export const DotIcon = icon(Dot);

/** 书籍信息页元数据 */
export const AuthorIcon = icon(Users);
export const OriginIcon = icon(Globe);
export const ChapterMetaIcon = icon(Book);
export const WordCountIcon = icon(FileText);
export const UpdateTimeIcon = icon(Clock);
export const TocMetaIcon = icon(BookMarked);

/** 分组默认封面（系统分组） */
export const GroupAllIcon = icon(Book);
export const GroupLocalIcon = icon(HardDrive);
export const GroupAudioIcon = icon(Music);
export const GroupVideoIcon = icon(Film);
export const GroupNetIcon = icon(Globe);
export const GroupFolderIcon = icon(Folder);
export const GroupErrorIcon = icon(CircleAlert);
export const GroupDefaultIcon = icon(BookOpen);

/** 书架阅读进度（对齐 Legado 列表 ic_book_last / ic_history） */
export const BookshelfLatestChapterIcon = icon(BookMarked);
export const BookshelfReadProgressIcon = icon(History);

/** 阅读器 */
export const VolumeOnIcon = icon(Volume2);
export const VolumeOffIcon = icon(VolumeOff);
export const ChevronUpIcon = icon(ChevronUp);
export const TrashIcon = icon(Trash2);
/** 目录：章节尚未写入正文缓存 */
export const ChapterUncachedIcon = icon(Cloud);
