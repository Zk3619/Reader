/**
 * 本地书籍格式暂不支持时的统一提示文案
 */

/** MOBI/AZW3 导入时会尝试转换为 EPUB；失败时使用本提示 */
export const MOBI_UNSUPPORTED_MESSAGE = 'MOBI/AZW3 需转换为 EPUB 后导入';

/** 转换失败时的前缀（后接原因） */
export const MOBI_CONVERT_FAILED_MESSAGE = 'MOBI/AZW3 转 EPUB 失败';

/** UMD 暂不支持 */
export const UMD_UNSUPPORTED_MESSAGE = '暂不支持 .umd';
