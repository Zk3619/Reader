/**
 * SVG 图标组件
 * 用于替换项目中的 emoji 图标，更符合 Solid-UI 风格
 */

import type { Component } from 'solid-js';

interface IconProps {
  class?: string;
  size?: number;
}

const defaultSize = 16;

/**
 * 书架图标
 */
export const BookshelfIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  );
};

/**
 * 书源图标
 */
export const BookSourceIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
    </svg>
  );
};

/**
 * 订阅图标
 */
export const SubscriptionIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" />
      <path d="M15 18h-5" />
      <path d="M10 6h8v4h-8z" />
    </svg>
  );
};

/**
 * 书签图标
 */
export const BookmarkIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
};

/**
 * 记录图标
 */
export const RecordIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
};

/**
 * 设置图标
 */
export const SettingsIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
};

/**
 * 收藏图标（五角星）
 */
export const StarIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
};

/**
 * 主题：浅色（太阳）
 */
export const ThemeLightIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
};

/**
 * 主题：深色（月亮）
 */
export const ThemeDarkIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
};

/**
 * 主题：跟随系统（显示器）
 */
export const ThemeAutoIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
};

/**
 * 加入书架图标（书架 + 加号）
 */
export const AddToShelfIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      {/* 加号：上移并略放大，居中于 (12,10) */}
      <path d="M12 7.5v5" />
      <path d="M9.5 10h5" />
    </svg>
  );
};

/**
 * 移出书架图标（书架 + 减号）
 */
export const RemoveFromShelfIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      {/* 减号：与加号水平线同位置 */}
      <path d="M9.5 10h5" />
    </svg>
  );
};

/**
 * 书籍信息图标（信息卡片图标，区别于书签图标）
 */
export const BookInfoIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
};

/**
 * 搜索图标
 */
export const SearchIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
};

/**
 * 更多图标（三个点）
 */
export const MoreIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
};

/**
 * 更新目录图标
 */
export const RefreshIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
};

/**
 * 添加本地图标
 */
export const FolderPlusIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M12 10v6" />
      <path d="M9 13h6" />
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h16z" />
    </svg>
  );
};

/**
 * 远程书籍图标
 */
export const GlobeIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
};

/**
 * 添加网址图标
 */
export const LinkIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
};

/**
 * 书架管理图标
 */
export const Settings2Icon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M20 7h-9" />
      <path d="M14 17H5" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </svg>
  );
};

/**
 * 书架布局图标
 */
export const LayoutIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
};

/**
 * 分组管理图标
 */
export const FolderTreeIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1z" />
      <path d="M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 14h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1z" />
      <path d="M3 5a2 2 0 0 1 2-2h3" />
      <path d="M3 19a2 2 0 0 0 2 2h3" />
      <path d="M3 5v14" />
    </svg>
  );
};

/**
 * 缓存导出图标
 */
export const DownloadIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
};

/**
 * 导出书单图标
 */
export const UploadIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
};

/**
 * 导入书单图标
 */
export const ImportIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
};

/**
 * 查看日志图标
 */
export const FileTextIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
};

/**
 * 二维码图标（书源二维码导入等）
 */
export const QrCodeIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <rect width="5" height="5" x="3" y="3" rx="1" />
      <rect width="5" height="5" x="16" y="3" rx="1" />
      <rect width="5" height="5" x="3" y="16" rx="1" />
      <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
      <path d="M21 21v.01" />
      <path d="M12 7v3a2 2 0 0 1-2 2H7" />
      <path d="M3 12h.01" />
      <path d="M12 3h.01" />
      <path d="M12 16v.01" />
      <path d="M16 12h1" />
      <path d="M21 12v.01" />
      <path d="M12 21v-1" />
    </svg>
  );
};

/**
 * 左箭头（返回）
 */
export const ChevronLeftIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
};

/**
 * 列表/目录图标
 */
export const ListIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
};

/**
 * 沉浸阅读图标（专注正文，隐藏顶底栏与段评）- 打开的书本，表示专注阅读
 */
export const ImmersiveIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
};

/**
 * 文件夹图标
 */
export const FolderIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h16z" />
    </svg>
  );
};

/**
 * 文件图标
 */
export const FileIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
};

/**
 * 右箭头图标
 */
export const ChevronRightIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
};

/**
 * 下箭头（展开/收起）
 */
export const ChevronDownIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
};

/**
 * 加载图标（旋转）
 */
export const LoaderIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
};

/**
 * 打开书籍/阅读图标
 */
export const BookOpenIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
};

/**
 * 替换/换源图标（左右箭头）
 */
export const ReplaceIcon: Component<IconProps> = (props) => {
  const size = () => props.size || defaultSize;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class || `h-${size()} w-${size()}`}
    >
      <path d="m16 3 4 4 -4-4" />
      <path d="M20 7H4" />
      <path d="m8 21-4-4 4 4" />
      <path d="M4 17h16" />
    </svg>
  );
};
