import { describe, expect, it, vi } from 'vitest';
import {
  formatDownloadCreateFailureTitle,
  formatDownloadErrorForUser,
  logDownloadError,
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

  it('maps Douyin cookie / anti-bot errors ahead of generic network', () => {
    expect(
      formatDownloadErrorForUser(
        'ytdlp extract_info failed: Douyin returned empty detail JSON (anti-bot). Export browser cookies',
      ),
    ).toMatch(/Cookie|cookiesfrombrowser|浏览器/);
  });

  it('titles create failures', () => {
    expect(formatDownloadCreateFailureTitle('404 Not Found')).toBe('无法添加任务');
    expect(formatDownloadCreateFailureTitle('timeout')).toBe('无法连接目标地址');
  });
});

describe('logDownloadError', () => {
  it('returns user message and writes console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const msg = logDownloadError('unit', new Error('connection timed out'), { url: 'x' });
    expect(msg).toMatch(/网络|连接/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
