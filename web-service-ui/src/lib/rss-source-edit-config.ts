/**
 * 订阅源编辑表单配置（对齐 Legado rssSourceEditConfig.ts）
 */

export type RssSourceEditFieldType = 'String' | 'Boolean' | 'Number' | 'Array';

export interface RssSourceEditField {
  title: string;
  id: string;
  type: RssSourceEditFieldType;
  hint?: string;
  required?: boolean;
  array?: string[];
}

export interface RssSourceEditSection {
  key: string;
  name: string;
  children: RssSourceEditField[];
}

export const RSS_SOURCE_EDIT_SECTIONS: RssSourceEditSection[] = [
  {
    key: 'base',
    name: '基础',
    children: [
      { title: '源域名', id: 'sourceUrl', type: 'String', hint: '通常填写网站主页', required: true },
      { title: '图标', id: 'sourceIcon', type: 'String', hint: '填写图片网络链接' },
      { title: '源名称', id: 'sourceName', type: 'String', hint: '会显示在源列表', required: true },
      { title: '源分组', id: 'sourceGroup', type: 'String' },
      { title: '源注释', id: 'sourceComment', type: 'String' },
      { title: '搜索地址', id: 'searchUrl', type: 'String', hint: '[域名可省略]/search.php@kw={{key}}' },
      { title: '分类地址', id: 'sortUrl', type: 'String', hint: '名称1::链接1\n名称2::链接2' },
      { title: '登录地址', id: 'loginUrl', type: 'String' },
      { title: '登录界面', id: 'loginUi', type: 'String' },
      { title: '登录检测', id: 'loginCheckJs', type: 'String' },
      { title: '封面解密', id: 'coverDecodeJs', type: 'String' },
      { title: '请求头', id: 'header', type: 'String' },
      { title: '变量说明', id: 'variableComment', type: 'String' },
      { title: '并发率', id: 'concurrentRate', type: 'String' },
      { title: 'js库', id: 'jsLib', type: 'String' },
    ],
  },
  {
    key: 'start',
    name: '启动',
    children: [
      { title: '启动页html', id: 'startHtml', type: 'String' },
      { title: '启动页样式', id: 'startStyle', type: 'String', hint: '填写 css' },
      { title: '启动页Js', id: 'startJs', type: 'String' },
      { title: '预注入Js', id: 'preloadJs', type: 'String' },
    ],
  },
  {
    key: 'list',
    name: '列表',
    children: [
      { title: '列表规则', id: 'ruleArticles', type: 'String' },
      { title: '翻页规则', id: 'ruleNextPage', type: 'String' },
      { title: '标题规则', id: 'ruleTitle', type: 'String' },
      { title: '时间规则', id: 'rulePubDate', type: 'String' },
      { title: '描述规则', id: 'ruleDescription', type: 'String' },
      { title: '图片规则', id: 'ruleImage', type: 'String' },
      { title: '链接规则', id: 'ruleLink', type: 'String' },
    ],
  },
  {
    key: 'webView',
    name: 'WebView',
    children: [
      { title: '内容规则', id: 'ruleContent', type: 'String' },
      { title: '样式规则', id: 'style', type: 'String', hint: '填写 css' },
      { title: '注入规则', id: 'injectJs', type: 'String' },
      { title: '黑名单', id: 'contentBlacklist', type: 'String' },
      { title: '白名单', id: 'contentWhitelist', type: 'String' },
      { title: '链接拦截', id: 'shouldOverrideUrlLoading', type: 'String' },
    ],
  },
  {
    key: 'other',
    name: '其他',
    children: [
      { title: '源类型', id: 'type', type: 'Array', array: ['网页', '图片', '视频'] },
      { title: '列表样式', id: 'articleStyle', type: 'Array', array: ['默认', '大图', '双列', '瀑布', '三列'] },
      { title: '预加载', id: 'preload', type: 'Boolean' },
      { title: '加载地址', id: 'loadWithBaseUrl', type: 'Boolean' },
      { title: '启用JS', id: 'enableJs', type: 'Boolean' },
      { title: '输出WebLog', id: 'showWebLog', type: 'Boolean' },
      { title: '优先加载缓存', id: 'cacheFirst', type: 'Boolean' },
      { title: '启用', id: 'enabled', type: 'Boolean' },
      { title: 'Cookie', id: 'enabledCookieJar', type: 'Boolean' },
      { title: '单URL', id: 'singleUrl', type: 'Boolean' },
      { title: '排序编号', id: 'customOrder', type: 'Number' },
    ],
  },
];
