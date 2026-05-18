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
  Folder,
  FolderPlus,
  FolderTree,
  Globe,
  GripVertical,
  HardDrive,
  Image,
  Info,
  LayoutGrid,
  LibraryBig,
  Link,
  List,
  LoaderCircle,
  Minus,
  Monitor,
  Moon,
  Music,
  Newspaper,
  PanelLeft,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  Sun,
  Upload,
  Users,
  X,
  Maximize,
  Minimize,
  Volume2,
  ChevronUp,
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
export const SubscriptionIcon = icon(Newspaper);
export const BookmarkIcon = icon(Bookmark);
export const RecordIcon = icon(Clock);
export const SettingsIcon = icon(Settings);
export const StarIcon = icon(Star);
export const ThemeLightIcon = icon(Sun);
export const ThemeDarkIcon = icon(Moon);
export const ThemeAutoIcon = icon(Monitor);
export const AddToShelfIcon = icon(BookPlus);
export const RemoveFromShelfIcon = icon(BookMinus);
export const BookInfoIcon = icon(Info);
export const SearchIcon = icon(Search);
export const MoreIcon = icon(Ellipsis);
export const RefreshIcon = icon(RefreshCw);
export const FolderPlusIcon = icon(FolderPlus);
export const GlobeIcon = icon(Globe);
export const LinkIcon = icon(Link);
export const Settings2Icon = icon(SlidersHorizontal);
export const LayoutIcon = icon(LayoutGrid);
export const FolderTreeIcon = icon(FolderTree);
export const DownloadIcon = icon(Download);
export const UploadIcon = icon(Upload);
export const ImportIcon = icon(Download);
export const FileTextIcon = icon(FileText);
export const QrCodeIcon = icon(QrCode);
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
export const GroupNetIcon = icon(Globe);
export const GroupFolderIcon = icon(Folder);
export const GroupErrorIcon = icon(CircleAlert);
export const GroupDefaultIcon = icon(BookOpen);

/** 阅读器 */
export const VolumeIcon = icon(Volume2);
export const ChevronUpIcon = icon(ChevronUp);
