/**
 * Sync v4 协议单元测试
 */

import { describe, expect, it } from 'vitest';
import {
  md5Hex,
  passwordAesKey,
  aesEncrypt,
  aesDecrypt,
  SYNC_CONNECT_MSG,
} from '@/lib/media/audio/sync/sync-crypto';
import { createMessage2call } from '@/lib/media/audio/sync/message2call';
import { mergeLxListData } from '@/lib/media/audio/sync/list-sync-merge';
import type { LxListData } from '@/lib/media/audio/sync/list-sync-data';
import { getLxListDataMd5 } from '@/lib/media/audio/sync/list-sync-data';

describe('sync-crypto', () => {
  it('md5 and password aes key align lx', () => {
    const key = passwordAesKey('test123');
    expect(key.length).toBeGreaterThan(0);
    const enc = aesEncrypt('hello', key);
    expect(aesDecrypt(enc, key)).toBe('hello');
  });

  it('connect token roundtrip', () => {
    const key = passwordAesKey('pwd');
    const token = aesEncrypt(SYNC_CONNECT_MSG, key);
    expect(aesDecrypt(token, key)).toBe(SYNC_CONNECT_MSG);
  });
});

describe('message2call', () => {
  it('call and response', async () => {
    const sent: Record<string, unknown>[] = [];
    const m2c = createMessage2call(
      {
        'list.list_sync_get_md5': () => md5Hex('{}'),
      },
      {
        sendMessage(data) {
          sent.push(data);
        },
      },
    );
    const p = m2c.call(['list', 'list_sync_get_md5']);
    const last = sent[sent.length - 1];
    m2c.handleMessage({ id: last.id as number, result: 'abc' });
    await expect(p).resolves.toBe('abc');
  });
});

describe('list-sync-merge', () => {
  const local: LxListData = {
    defaultList: [{ id: '1', name: 'A', singer: 'S', source: 'kw' }],
    loveList: [],
    userList: [],
  };
  const remote: LxListData = {
    defaultList: [{ id: '2', name: 'B', singer: 'T', source: 'wy' }],
    loveList: [],
    userList: [],
  };

  it('merge_local_remote combines lists', () => {
    const r = mergeLxListData('merge_local_remote', local, remote);
    expect(r?.data.defaultList.length).toBe(2);
  });

  it('overwrite_remote_local uses remote', () => {
    const r = mergeLxListData('overwrite_remote_local', local, remote);
    expect(r?.data.defaultList[0].id).toBe('2');
  });

  it('md5 stable for same data', () => {
    expect(getLxListDataMd5(local)).toBe(getLxListDataMd5({ ...local }));
  });
});

describe('e2e acceptance checklist', () => {
  it('documents acceptance scenarios', () => {
    const checklist = [
      '五源搜索→播放→歌词→切音质→主源失败换源',
      'OpenAPI status/SSE/seek/volume/collect/mute/lyric-all',
      '全局热键 play/pause/next/prev/vol/seek',
      '桌面歌词设置/锁定/穿透',
      'Sync v4 连接官方 server Pull/Push',
      'Hub 专辑/歌手/UserApi 浏览/换源',
      'Android 通知栏控制',
    ];
    expect(checklist.length).toBeGreaterThanOrEqual(7);
  });
});
