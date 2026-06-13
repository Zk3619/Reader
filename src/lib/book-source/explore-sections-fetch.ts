/**
 * 发现脚本分类拉取：切换 select / 刷新时取消进行中的 HTTP 与脚本，并忽略过期结果。
 */

const sessions = new Map<
  string,
  {
    generation: number;
    abort: AbortController;
  }
>();

export function isExploreSectionsFetchSuperseded(
  sourceKey: string,
  generation: number,
): boolean {
  return (sessions.get(sourceKey)?.generation ?? 0) !== generation;
}

/** 取消该书源进行中的发现分类请求（切换筛选、清缓存时调用） */
export function cancelExploreSectionsFetch(sourceKey: string): number {
  const prev = sessions.get(sourceKey);
  prev?.abort.abort();
  const generation = (prev?.generation ?? 0) + 1;
  sessions.set(sourceKey, { generation, abort: new AbortController() });
  return generation;
}

/** 开始一次发现分类拉取，返回当前代次与可传给 HTTP 的 signal */
export function beginExploreSectionsFetch(sourceKey: string): {
  generation: number;
  signal: AbortSignal;
} {
  const generation = cancelExploreSectionsFetch(sourceKey);
  const session = sessions.get(sourceKey)!;
  return { generation, signal: session.abort.signal };
}

export function cancelAllExploreSectionsFetches(): void {
  for (const key of [...sessions.keys()]) {
    cancelExploreSectionsFetch(key);
  }
}
