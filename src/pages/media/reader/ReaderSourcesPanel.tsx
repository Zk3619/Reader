/**
 * 阅读模块 — Legado 书源管理（不含 lx 音乐源）
 */

import { SourcesPage, type SourcesPageProps } from '@/pages/media/reader/sources/SourcesPage';

export type ReaderSourcesPanelProps = SourcesPageProps;

export function ReaderSourcesPanel(props: ReaderSourcesPanelProps) {
  return <SourcesPage {...props} />;
}
