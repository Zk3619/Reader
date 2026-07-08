/**
 * Reader 主题系统统一入口
 */

export * from '@/lib/theme/types';
export * from '@/lib/theme/tokens';
export * from '@/lib/theme/color-utils';
export * from '@/lib/theme/apply-css-vars';
export * from '@/lib/theme/merge-theme';
export * from '@/lib/theme/AppTheme';
export * from '@/lib/theme/MediaViewerTheme';
export * from '@/lib/theme/TextViewerTheme';
export * from '@/lib/theme/ImageViewerTheme';
export * from '@/lib/theme/AudioViewerTheme';
export * from '@/lib/theme/VideoViewerTheme';
export * from '@/lib/theme/FileViewerTheme';
export * from '@/lib/theme/runtime';
export * from '@/lib/theme/theme-runtime';
export * from '@/lib/theme/schema/theme-pack-v1';
export * from '@/lib/theme/schema/validate-theme-pack';

import { DEFAULT_MEDIA_VIEWER_STAGE } from '@/lib/theme/MediaViewerTheme';
import { IMAGE_VIEWER_STAGE } from '@/lib/theme/ImageViewerTheme';
import { AUDIO_VIEWER_STAGE } from '@/lib/theme/AudioViewerTheme';
import { VIDEO_VIEWER_STAGE } from '@/lib/theme/VideoViewerTheme';
import { FILE_VIEWER_STAGE } from '@/lib/theme/FileViewerTheme';

/** 各 viewer 预设 stage 主题（便于页面引用） */
export const VIEWER_STAGE_THEMES = {
  media: DEFAULT_MEDIA_VIEWER_STAGE,
  text: undefined,
  image: IMAGE_VIEWER_STAGE,
  audio: AUDIO_VIEWER_STAGE,
  video: VIDEO_VIEWER_STAGE,
  file: FILE_VIEWER_STAGE,
} as const;
