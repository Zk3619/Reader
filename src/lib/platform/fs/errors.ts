import type { FsLayer, FsPlatform } from '@/lib/platform/fs/capabilities';

export class FsUserCancelledError extends Error {
  readonly name = 'FsUserCancelledError';
}

export class FsUnsupportedError extends Error {
  readonly name = 'FsUnsupportedError';
  readonly platform: FsPlatform;
  readonly operation: 'pickFile' | 'pickDirectory' | 'read' | 'write' | 'list';
  readonly attemptedLayers: FsLayer[];

  constructor(
    platform: FsPlatform,
    operation: FsUnsupportedError['operation'],
    attemptedLayers: FsLayer[],
    message?: string,
  ) {
    super(
      message ??
        `当前平台（${platform}）不支持「${operation}」，已尝试：${attemptedLayers.join(' → ')}`,
    );
    this.platform = platform;
    this.operation = operation;
    this.attemptedLayers = attemptedLayers;
  }
}

export function isUserCancelled(error: unknown): boolean {
  if (error instanceof FsUserCancelledError) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return false;
}
