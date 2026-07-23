/**
 * 番剧 Hub UI 状态（浏览 / 详情 / 选源）
 */

import { createStore } from 'solid-js/store';
import type { BangumiSubject } from '@/lib/media/video/bangumi/meta/types';
import type { BangumiSearchHit } from '@/lib/media/video/bangumi/engine';

export type BangumiUiView = 'browse' | 'detail' | 'sources';

type BangumiUiState = {
  view: BangumiUiView;
  subjectId: number | null;
  subject: BangumiSubject | null;
  /** 选源阶段：规则搜索结果 */
  sourceHits: BangumiSearchHit[];
  sourceKeyword: string;
  resumeEpisodeUrl?: string;
  resumeRuleId?: string;
};

const [state, setState] = createStore<BangumiUiState>({
  view: 'browse',
  subjectId: null,
  subject: null,
  sourceHits: [],
  sourceKeyword: '',
});

export function getBangumiUi() {
  return state;
}

export function openBangumiSubject(
  subject: BangumiSubject,
  opts?: { resumeEpisodeUrl?: string; resumeRuleId?: string },
): void {
  setState({
    view: 'detail',
    subjectId: subject.id,
    subject,
    sourceHits: [],
    sourceKeyword: '',
    resumeEpisodeUrl: opts?.resumeEpisodeUrl,
    resumeRuleId: opts?.resumeRuleId,
  });
}

export async function openBangumiById(
  id: number,
  opts?: { resumeEpisodeUrl?: string; resumeRuleId?: string },
): Promise<void> {
  const { fetchBangumiSubject } = await import('@/lib/media/video/bangumi/meta/api');
  const subject = await fetchBangumiSubject(id);
  openBangumiSubject(subject, opts);
}

export function backBangumiBrowse(): void {
  setState({
    view: 'browse',
    subjectId: null,
    subject: null,
    sourceHits: [],
    resumeEpisodeUrl: undefined,
    resumeRuleId: undefined,
  });
}

export function setBangumiSourceHits(hits: BangumiSearchHit[], keyword: string): void {
  setState({ view: 'sources', sourceHits: hits, sourceKeyword: keyword });
}

export function setBangumiView(view: BangumiUiView): void {
  setState({ view });
}
