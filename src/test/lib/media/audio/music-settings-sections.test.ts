import { describe, expect, it } from 'vitest';
import {
  MUSIC_SETTINGS_SECTIONS,
} from '@/components/media/viewer/audio/music/settings/music-settings-sections';

describe('music settings sections', () => {
  it('matches the Reader music domain category order', () => {
    expect(MUSIC_SETTINGS_SECTIONS.map(({ label }) => label)).toEqual([
      '主题与外观',
      '音源与账号',
      '播放',
      '播放详情',
      '桌面歌词',
      '搜索',
      '列表',
      '下载',
      '快捷键',
      '服务与同步',
      '数据与维护',
    ]);
  });

  it('does not expose main-program categories in music settings', () => {
    const ids = MUSIC_SETTINGS_SECTIONS.map(({ id }) => id);
    expect(ids).not.toEqual(expect.arrayContaining(['network', 'update', 'about']));
  });

  it('keeps every category id unique', () => {
    const ids = MUSIC_SETTINGS_SECTIONS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
