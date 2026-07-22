/**
 * 音乐模块设置项检索目录（对齐 `src/lib/settings/settings-catalog.ts` 的搜索体验）
 *
 * 覆盖 `MUSIC_SETTINGS_SECTIONS` 下的关键设置项，供设置面板搜索框、移动端卡片列表使用。
 * 部分 id 对应各设置文件内用 `SettingItemAnchor` 包裹的锚点（用于高亮定位）；
 * 未被包裹的条目仍可正确跳转到所属分区，仅无法精确高亮到具体控件。
 *
 * `platforms`：限定可见平台；缺省表示全平台可见（与各设置页 Show when / early-return 对齐）。
 */

import { fuzzyMatchQuery } from '@/lib/sources/source-list-filter';
import {
  MUSIC_SETTINGS_SECTIONS,
  type MusicSettingsSection,
} from '@/components/media/viewer/audio/music/settings/music-settings-sections';
import { isAndroid, isMacOS, isMobile, isTauri, isWeb } from '@/lib/platform/detect';

/** 与设置 UI 中的平台守卫对齐 */
export type MusicSettingsPlatform =
  | 'desktop' // Tauri 桌面（非 Android）
  | 'android'
  | 'mobile' // 手机/平板 UA 或 Android
  | 'tauri'
  | 'web'
  | 'macos';

export interface MusicSettingsItemDef {
  id: string;
  sectionId: MusicSettingsSection;
  title: string;
  description?: string;
  keywords: string[];
  /** 缺省 = 当前平台均可见 */
  platforms?: MusicSettingsPlatform[];
}

function matchPlatform(p: MusicSettingsPlatform): boolean {
  switch (p) {
    case 'desktop':
      return isTauri() && !isAndroid();
    case 'android':
      return isAndroid();
    case 'mobile':
      return isMobile() || isAndroid();
    case 'tauri':
      return isTauri();
    case 'web':
      return isWeb();
    case 'macos':
      return isMacOS();
    default:
      return true;
  }
}

export function isMusicSettingsItemVisible(item: MusicSettingsItemDef): boolean {
  if (!item.platforms?.length) return true;
  return item.platforms.some(matchPlatform);
}

/** 当前平台可见的分区（侧栏 / 移动 Hub） */
export function listVisibleMusicSettingsSections() {
  return MUSIC_SETTINGS_SECTIONS.filter((section) => {
    if (section.id === 'hotKey') return isTauri();
    // Web 仅占位提示；桌面歌词 UI 仅 Tauri 桌面或 Android 悬浮词
    if (section.id === 'desktopLyric') return isTauri() || isAndroid();
    return true;
  });
}

export const MUSIC_SETTINGS_ITEMS: MusicSettingsItemDef[] = [
  // 主题与外观
  {
    id: 'music-theme-preset',
    sectionId: 'theme',
    title: '音乐主题',
    description: '内置或自定义主题包，可独立于主程序主题切换',
    keywords: ['主题', '外观', '预设', '内置', '自定义主题', '樱花'],
  },
  {
    id: 'music-theme-override',
    sectionId: 'theme',
    title: '子页面主题覆盖',
    description: '播放详情、桌面歌词可单独覆盖或恢复继承音乐主题',
    keywords: ['主题覆盖', '播放详情', '桌面歌词', '继承', '恢复'],
  },

  // 音源与账号
  {
    id: 'music-source-userapi',
    sectionId: 'basic',
    title: '自定义源（LX UserApi）',
    description: '导入 LX 兼容脚本作为主音源',
    keywords: ['自定义源', 'UserApi', 'LX', '音源', '导入', '脚本'],
  },
  {
    id: 'music-source-mfplugin',
    sectionId: 'basic',
    title: 'MusicFree 插件（辅源）',
    description: '安装 MusicFree 插件作为 LX 之外的辅助音源',
    keywords: ['MusicFree', '插件', '辅源', 'mf', '安装'],
  },
  {
    id: 'music-source-account',
    sectionId: 'basic',
    title: '平台账号',
    description: '登录网易云、QQ 音乐等平台账号',
    keywords: ['账号', '登录', '网易云', 'QQ音乐', '平台', 'cookie'],
  },

  // 播放
  {
    id: 'play-basic',
    sectionId: 'play',
    title: '播放基础设置',
    description: '启动自动播放、防休眠、记住进度、歌词翻译与罗马音等',
    keywords: ['自动播放', '防休眠', '记住进度', '歌词翻译', '罗马音', '任务栏进度', '声道'],
  },
  {
    id: 'play-controls',
    sectionId: 'play',
    title: '播放控制',
    description: '选中自动播放、默认倍速、保持音高、进度条拖动与播放模式',
    keywords: ['播放控制', '倍速', '音高', '进度条', '拖动', '播放模式', '列表循环', '随机'],
  },
  {
    id: 'play-quality',
    sectionId: 'play',
    title: '优先播放的音质',
    description: '按当前音源能力动态解析的音质偏好',
    keywords: ['音质', '播放音质', '最低音质', '最高音质', '固定音质'],
  },
  {
    id: 'play-url-source-mode',
    sectionId: 'play',
    title: '取流策略',
    description: '固定仅 UserApi / MusicFree 取链（对齐 LX，无内置取链开关）',
    keywords: ['取流策略', 'UserApi', 'MusicFree', '内置源', '取链', 'LX'],
  },
  {
    id: 'play-lyric-track',
    sectionId: 'play',
    title: '默认歌词轨与歌词转换',
    description: '默认歌词轨、卡拉OK 逐字歌词、简繁转换',
    keywords: ['歌词轨', '逐字歌词', '卡拉OK', '简繁转换', '繁体', '简体'],
  },
  {
    id: 'play-timer-fallback',
    sectionId: 'play',
    title: '定时关闭与跨源兜底',
    description: '播放定时、歌词偏移、多源兜底、跨源匹配打分与交叉淡入淡出',
    keywords: ['定时关闭', '睡眠定时', '歌词偏移', '兜底', '换源', '打分', 'crossfade', '交叉淡入淡出', '仅缓存', '离线'],
  },
  {
    id: 'play-mini-mode',
    sectionId: 'play',
    title: '桌面迷你播放窗',
    description: '独立置顶小窗，浏览其他页面时控制音乐',
    keywords: ['迷你播放窗', 'MiniMode', '置顶', '小窗'],
    platforms: ['desktop'],
  },
  {
    id: 'play-cellular',
    sectionId: 'play',
    title: '移动网络播放与下载',
    description: '蜂窝网络下播放/下载限制与强制低音质',
    keywords: ['蜂窝网络', '移动网络', '流量', '低音质', 'Android'],
    platforms: ['mobile'],
  },
  {
    id: 'play-audio-output',
    sectionId: 'play',
    title: '音频输出',
    description: '输出设备选择与最大声道数、设备移除时暂停',
    keywords: ['音频输出', '输出设备', '声道', '蓝牙', '扬声器'],
  },

  // 播放详情
  {
    id: 'play-detail-layout',
    sectionId: 'playDetail',
    title: '播放详情页布局',
    description: '独立展示、隐藏顶栏、桌面端侧栏抽屉',
    keywords: ['播放详情', '独立展示', '隐藏顶栏', '侧栏抽屉', '布局'],
  },
  {
    id: 'play-detail-lyric-seek',
    sectionId: 'playDetail',
    title: '歌词拖拽与双击跳转',
    description: '拖拽歌词调整进度、松开自动播放、双击跳转',
    keywords: ['歌词拖拽', '双击跳转', '进度预览', '自动播放'],
  },
  {
    id: 'play-detail-lyric-color',
    sectionId: 'playDetail',
    title: '歌词颜色',
    description: '播放详情页歌词颜色预设与自定义',
    keywords: ['歌词颜色', '预设', '自定义颜色', '阴影'],
  },
  {
    id: 'play-detail-lyric-align',
    sectionId: 'playDetail',
    title: '歌词对齐方式',
    description: '居左、居中、居右',
    keywords: ['歌词对齐', '居左', '居中', '居右'],
  },
  {
    id: 'play-detail-lyric-font',
    sectionId: 'playDetail',
    title: '歌词字体',
    description: '播放详情页歌词字号与单位',
    keywords: ['歌词字体', '字号', 'rem', 'px'],
  },
  {
    id: 'play-detail-visualizer',
    sectionId: 'playDetail',
    title: '频谱可视化',
    description: '播放详情页频谱绘制帧率',
    keywords: ['频谱', '可视化', '帧率', 'fps'],
  },

  // 桌面歌词
  {
    id: 'desktop-lyric-window',
    sectionId: 'desktopLyric',
    title: '窗口与显示',
    description: '锁定、鼠标穿透、置顶、全屏自动关闭、限制拖出屏幕',
    keywords: ['桌面歌词', '窗口', '锁定', '穿透', '置顶', '全屏', '限制拖出'],
    platforms: ['desktop'],
  },
  {
    id: 'desktop-lyric-layout-align',
    sectionId: 'desktopLyric',
    title: '歌词布局与对齐',
    description: '单行/双行布局、显示方向、滚动位置、对齐方式',
    keywords: ['布局', '单行', '双行', '方向', '滚动位置', '对齐'],
    platforms: ['desktop'],
  },
  {
    id: 'desktop-lyric-color',
    sectionId: 'desktopLyric',
    title: '歌词颜色',
    description: '桌面歌词颜色预设与自定义',
    keywords: ['桌面歌词颜色', '预设', '自定义'],
    platforms: ['desktop'],
  },
  {
    id: 'desktop-lyric-font',
    sectionId: 'desktopLyric',
    title: '歌词字体',
    description: '字体、字号、行距、不透明度',
    keywords: ['字体', '字号', '行距', '不透明度'],
    platforms: ['desktop'],
  },
  {
    id: 'desktop-lyric-meta',
    sectionId: 'desktopLyric',
    title: '歌曲名与艺术家显示',
    description: '标题字号、不透明度、加粗与颜色',
    keywords: ['歌曲名', '艺术家', '标题', '加粗', '颜色'],
    platforms: ['desktop'],
  },
  {
    id: 'desktop-lyric-android',
    sectionId: 'desktopLyric',
    title: 'Android 悬浮歌词',
    description: '悬浮窗权限与样式（桌面歌词设置子集）',
    keywords: ['Android', '悬浮窗', '悬浮歌词', '权限'],
    platforms: ['android'],
  },

  // 搜索
  {
    id: 'search-settings-general',
    sectionId: 'search',
    title: '搜索设置',
    description: '热门搜索、历史记录、自动聚焦、离开时清空',
    keywords: ['搜索', '热门搜索', '历史记录', '聚焦', '清空'],
  },

  // 列表
  {
    id: 'list-general',
    sectionId: 'list',
    title: '列表设置',
    description: '操作按钮、来源平台、滚动位置记忆、双击/单击播放',
    keywords: ['列表', '操作按钮', '来源平台', '滚动位置', '双击播放', '单击播放'],
  },
  {
    id: 'list-add-position',
    sectionId: 'list',
    title: '添加歌曲到列表时的位置',
    description: '新歌加入播放列表时插入顶部或底部',
    keywords: ['添加歌曲', '列表位置', '顶部', '底部'],
  },
  {
    id: 'list-columns',
    sectionId: 'list',
    title: '列显示与交互',
    description: '专辑名、时长、拖拽排序、切换列表时清空队列',
    keywords: ['专辑名', '时长', '拖拽排序', '清空队列'],
  },

  // 下载
  {
    id: 'download-media-dir',
    sectionId: 'download',
    title: '模块媒体目录',
    description: '音乐缓存与下载目录，跟随全局或单独覆盖',
    keywords: ['媒体目录', '下载目录', 'MediaRoot', '跟随全局', '自定义目录'],
  },
  {
    id: 'download-general',
    sectionId: 'download',
    title: '下载设置',
    description: '启用下载、跳过同名文件、按列表分子目录',
    keywords: ['下载设置', '启用下载', '跳过同名', '子目录', '分组'],
  },
  {
    id: 'download-concurrency',
    sectionId: 'download',
    title: '同时下载任务数',
    description: '并发数过大可能导致 IP 被封禁',
    keywords: ['并发', '同时下载', '任务数', '限速'],
  },
  {
    id: 'download-naming',
    sectionId: 'download',
    title: '文件命名方式',
    description: '下载文件命名规则',
    keywords: ['文件命名', '命名规则', '文件名'],
  },
  {
    id: 'download-embed',
    sectionId: 'download',
    title: '嵌入到音频文件中的内容',
    description: '封面、歌词等元数据嵌入音频文件',
    keywords: ['嵌入', '元数据', '封面', 'ID3'],
  },
  {
    id: 'download-lyric',
    sectionId: 'download',
    title: '歌词下载',
    description: '下载歌曲时同时保存歌词文件',
    keywords: ['歌词下载', 'lrc', '歌词文件'],
  },
  {
    id: 'download-quality',
    sectionId: 'download',
    title: '下载音质',
    description: '下载任务使用的音质等级',
    keywords: ['下载音质', '音质等级'],
  },

  // 快捷键
  {
    id: 'hotkey-global',
    sectionId: 'hotKey',
    title: '全局快捷键',
    description: '播放/暂停、切歌、音量等全局快捷键绑定',
    keywords: ['快捷键', '全局快捷键', '绑定', '播放暂停', '切歌', '音量'],
    platforms: ['tauri'],
  },

  // 服务与同步
  {
    id: 'services-sync',
    sectionId: 'services',
    title: '数据同步',
    description: 'WebDAV 歌单备份与绑定列表同步',
    keywords: ['数据同步', 'WebDAV', '备份', '云同步'],
  },
  {
    id: 'services-openapi',
    sectionId: 'services',
    title: 'OpenAPI',
    description: '开放接口配置',
    keywords: ['OpenAPI', '开放接口', 'API'],
    platforms: ['tauri'],
  },
  {
    id: 'services-list-update',
    sectionId: 'services',
    title: '绑定列表更新',
    description: '启动时自动检查绑定歌单更新',
    keywords: ['绑定列表', '自动更新', '歌单同步'],
  },

  // 数据与维护
  {
    id: 'data-backup',
    sectionId: 'dataMaintenance',
    title: '备份与恢复',
    description: '音乐模块数据备份与恢复',
    keywords: ['备份', '恢复', '数据维护'],
  },
  {
    id: 'data-cache',
    sectionId: 'dataMaintenance',
    title: '缓存与不喜欢歌曲',
    description: '清理缓存、管理不喜欢歌曲列表',
    keywords: ['缓存', '清理', '不喜欢', '黑名单'],
  },
  {
    id: 'data-local-match',
    sectionId: 'dataMaintenance',
    title: '本地曲在线匹配',
    description: '本地文件自动匹配在线曲目补全封面与歌词',
    keywords: ['本地曲', '在线匹配', '封面补全', '歌词换源', 'findMusic'],
  },
];

const itemMap = new Map(MUSIC_SETTINGS_ITEMS.map((item) => [item.id, item]));

export function getMusicSettingsItem(id: string): MusicSettingsItemDef | undefined {
  return itemMap.get(id);
}

function itemSearchHaystack(item: MusicSettingsItemDef): string {
  return [item.title, item.description ?? '', ...item.keywords].join(' ');
}

export function searchMusicSettingsItems(query: string): MusicSettingsItemDef[] {
  const q = query.trim();
  if (!q) return [];
  return MUSIC_SETTINGS_ITEMS.filter(
    (item) => isMusicSettingsItemVisible(item) && fuzzyMatchQuery(q, itemSearchHaystack(item)),
  );
}
