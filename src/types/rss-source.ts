/**
 * RSS源类型定义
 * 对应 legado 项目的 RssSource.kt
 */

import type { BaseSource } from './base-source';

/**
 * RSS源实体（完整）
 */
export interface RssSource extends BaseSource {
  /** 地址，包括 http/https */
  sourceUrl: string;
  /** 名称 */
  sourceName: string;
  /** 图标 */
  sourceIcon: string;
  /** 分组 */
  sourceGroup?: string;
  /** 注释 */
  sourceComment?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 自定义变量说明 */
  variableComment?: string;
  /** 登录检测JS */
  loginCheckJs?: string;
  /** 封面解密JS */
  coverDecodeJs?: string;
  /** 分类URL */
  sortUrl?: string;
  /** 是否单URL源 */
  singleUrl: boolean;
  /** 列表样式：0, 1, 2 */
  articleStyle: number;
  /** 列表规则 */
  ruleArticles?: string;
  /** 下一页规则 */
  ruleNextPage?: string;
  /** 标题规则 */
  ruleTitle?: string;
  /** 发布日期规则 */
  rulePubDate?: string;
  /** 描述规则 */
  ruleDescription?: string;
  /** 图片规则 */
  ruleImage?: string;
  /** 链接规则 */
  ruleLink?: string;
  /** 正文规则 */
  ruleContent?: string;
  /** 正文URL白名单 */
  contentWhitelist?: string;
  /** 正文URL黑名单 */
  contentBlacklist?: string;
  /**
   * 跳转URL拦截
   * js, 返回true拦截,js变量url,可以通过js打开url,比如调用阅读搜索,添加书架等,简化规则写法,不用webView js注入
   */
  shouldOverrideUrlLoading?: string;
  /** WebView样式 */
  style?: string;
  /** 启用JS */
  enableJs: boolean;
  /** 使用BaseURL加载 */
  loadWithBaseUrl: boolean;
  /** 注入JS */
  injectJs?: string;
  /** 最后更新时间，用于排序 */
  lastUpdateTime: number;
  /** 手动排序编号 */
  customOrder: number;
  /** 允许额外的未知字段（用于兼容导入时的额外字段） */
  [key: string]: unknown;
}

/**
 * 新建RSS源（用于导入RSS源）
 */
export interface NewRssSource {
  sourceUrl: string;
  sourceName: string;
  sourceIcon?: string;
  sourceGroup?: string;
  sourceComment?: string;
  enabled?: boolean;
  singleUrl?: boolean;
  articleStyle?: number;
  ruleArticles?: string;
  ruleTitle?: string;
  rulePubDate?: string;
  ruleDescription?: string;
  ruleImage?: string;
  ruleLink?: string;
  ruleContent?: string;
  enableJs?: boolean;
  loadWithBaseUrl?: boolean;
  header?: string;
  jsLib?: string;
  [key: string]: unknown;
}
