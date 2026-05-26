/**
 * 书架阅读状态（Reader 扩展，非 Legado 原库字段）
 */
export const ReadStatus = {
  /** 未打开过正文 */
  Unread: 0,
  /** 在读（含末章未读完） */
  Reading: 1,
  /** 已读完 */
  Finished: 2,
} as const;

export type ReadStatus = (typeof ReadStatus)[keyof typeof ReadStatus];

export function normalizeReadStatus(value: unknown): ReadStatus {
  const n = Number(value);
  if (n === ReadStatus.Reading || n === ReadStatus.Finished) return n;
  return ReadStatus.Unread;
}

export function isUnreadStatus(status: ReadStatus): boolean {
  return status === ReadStatus.Unread;
}

export function isReadingStatus(status: ReadStatus): boolean {
  return status === ReadStatus.Reading;
}

export function isFinishedStatus(status: ReadStatus): boolean {
  return status === ReadStatus.Finished;
}
