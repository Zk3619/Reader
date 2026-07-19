/**
 * 影视配置类型（对齐 fongmi Config.type）
 * VOD=0 影视，LIVE=1 直播
 */

export const TV_CONFIG_TYPE_VOD = 0;
export const TV_CONFIG_TYPE_LIVE = 1;

export type TvConfigType = typeof TV_CONFIG_TYPE_VOD | typeof TV_CONFIG_TYPE_LIVE;

export function tvConfigTypeLabel(type: number): string {
  return type === TV_CONFIG_TYPE_LIVE ? '直播' : '影视';
}
