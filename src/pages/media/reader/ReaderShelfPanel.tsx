/**
 * 阅读模块 — 书架（Legado，全局 bookshelfStore）
 */

import { MediaShelfPage, type MediaShelfPageProps } from '@/pages/media/media-shelf/MediaShelfPage';

export type ReaderShelfPanelProps = MediaShelfPageProps;

export function ReaderShelfPanel(props: ReaderShelfPanelProps) {
  return <MediaShelfPage {...props} />;
}
