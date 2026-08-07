import { describe, expect, it } from 'vitest';
import {
  formatDownloadCreateFailureTitle,
  formatDownloadErrorForUser,
} from '@/lib/download/error-message';

describe('formatDownloadErrorForUser', () => {
  it('maps common technical errors to friendly Chinese', () => {
    expect(formatDownloadErrorForUser('HTTP 状态异常: 404')).toContain('404');
    expect(formatDownloadErrorForUser('connection timed out')).toMatch(/网络|连接/);
    expect(formatDownloadErrorForUser('Video is not available in this language')).toMatch(
      /地区|语言/,
    );
    expect(formatDownloadErrorForUser('')).toMatch(/失败/);
  });

  it('keeps short unknown messages', () => {
    expect(formatDownloadErrorForUser('自定义错误')).toBe('自定义错误');
  });

  it('titles create failures', () => {
    expect(formatDownloadCreateFailureTitle('404 Not Found')).toBe('无法添加任务');
    expect(formatDownloadCreateFailureTitle('timeout')).toBe('无法连接目标地址');
  });
});
