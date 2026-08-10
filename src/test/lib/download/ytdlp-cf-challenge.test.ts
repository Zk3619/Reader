import { describe, expect, it } from 'vitest';
import { makeYtdlpDownloadScope } from '@/lib/cookie-hub';
import { isCloudflareBlockedResponse } from '@/lib/http/cloudflare-verification';
import { formatDownloadErrorForUser } from '@/lib/download/error-message';

describe('ytdlp CF scope', () => {
  it('scopes by origin under video/#ytdlp-download', () => {
    const scope = makeYtdlpDownloadScope('https://9gag.com/gag/ae5Ag7B');
    expect(scope.module).toBe('video');
    expect(scope.scopeKey).toBe('https://9gag.com/#ytdlp-download');
  });

  it('detects Just a moment challenge HTML', () => {
    expect(
      isCloudflareBlockedResponse(
        403,
        '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>',
      ),
    ).toBe(true);
  });

  it('maps CF verification errors for UI', () => {
    expect(formatDownloadErrorForUser('Cloudflare 验证未完成')).toMatch(/Cloudflare|人机验证/);
  });
});
