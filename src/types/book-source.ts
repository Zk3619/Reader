/**
 * 书源类型定义
 * 对应 legado 项目的 BookSource.kt
 */

import type { BaseSource } from '@/types/base-source';
import type {
  SearchRule,
  ExploreRule,
  BookInfoRule,
  TocRule,
  ContentRule,
  ReviewRule,
} from '@/types/rule';

/**
 * 书源实体（完整）
 */
export interface BookSource extends BaseSource {
  /** Legado 书源 URL 字段（导入 JSON 常用；未设置时与 sourceUrl 一致） */
  bookSourceUrl?: string;
  /** 地址，包括 http/https */
  sourceUrl: string;
  /** 名称 */
  sourceName: string;
  /** 分组 */
  sourceGroup?: string;
  /** 类型：0=文本, 1=音频, 2=图片, 3=文件（只提供下载的网站） */
  sourceType: number;
  /** 详情页URL正则 */
  bookUrlPattern?: string;
  /** 手动排序编号 */
  customOrder: number;
  /** 是否启用 */
  enabled: boolean;
  /** 启用发现 */
  enableExplore: boolean;
  /** 登录检测JS */
  loginCheckJs?: string;
  /** 封面解密JS */
  coverDecodeJs?: string;
  /** 注释 */
  sourceComment?: string;
  /** 自定义变量说明 */
  variableComment?: string;
  /** 最后更新时间，用于排序 */
  lastUpdateTime: number;
  /** 响应时间，用于排序 */
  respondTime: number;
  /** 智能排序的权重 */
  weight: number;
  /** 发现URL */
  exploreUrl?: string;
  /** 发现筛选规则 */
  exploreScreen?: string;
  /** 发现规则 */
  ruleExplore?: ExploreRule;
  /** 搜索URL */
  searchUrl?: string;
  /** 搜索规则 */
  ruleSearch?: SearchRule;
  /** 书籍信息页规则 */
  ruleBookInfo?: BookInfoRule;
  /** 目录页规则 */
  ruleToc?: TocRule;
  /** 正文页规则 */
  ruleContent?: ContentRule;
  /** 段评规则 */
  ruleReview?: ReviewRule;
  /** 事件监听 */
  eventListener: boolean;
  /** 自定义按钮 */
  customButton: boolean;
  /** 下一页懒加载 */
  nextPageLazyLoad: boolean;
  /** 允许额外的未知字段（用于兼容导入时的额外字段） */
  [key: string]: unknown;
}

/**
 * 新建书源（用于导入书源）
 */
export interface NewBookSource {
  sourceUrl: string;
  sourceName: string;
  sourceGroup?: string;
  sourceType?: number;
  enabled?: boolean;
  enableExplore?: boolean;
  searchUrl?: string;
  exploreUrl?: string;
  ruleSearch?: SearchRule;
  ruleExplore?: ExploreRule;
  ruleBookInfo?: BookInfoRule;
  ruleToc?: TocRule;
  ruleContent?: ContentRule;
  header?: string;
  jsLib?: string;
  [key: string]: unknown;
}
