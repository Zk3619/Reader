/**
 * 分组封面校验与预览类型
 * 供分组管理列表、编辑表单等复用
 */

export type CoverPreviewType = 'data-url' | 'http-url' | 'emoji' | 'invalid';

export interface CoverPreviewInfo {
  url: string | null;
  isValid: boolean;
  type: CoverPreviewType;
}

function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
}

function isValidDataUrl(dataUrl: string): boolean {
  return /^data:image\/[^;]+;base64,/.test(dataUrl);
}

function isValidEmoji(str: string): boolean {
  const emojiRegex =
    /^[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2190}-\u{21FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}-\u{2B55}]|[\u{3030}-\u{303F}]|[\u{3299}-\u{3299}]|[\u{FE00}-\u{FE0F}]|[\u{FE20}-\u{FE2F}]|[\u{200D}]|[\u{20D0}-\u{20FF}]|[\u{00A9}]|[\u{00AE}]|[\u{2122}]|[\u{2139}]|[\u{2194}-\u{2199}]|[\u{21A9}-\u{21AA}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23EC}]|[\u{23F0}]|[\u{23F3}]|[\u{25FD}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2705}]|[\u{270A}-\u{270B}]|[\u{2728}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2795}-\u{2797}]|[\u{27B0}]|[\u{27BF}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]$/u;
  return emojiRegex.test(str.trim());
}

/**
 * 根据封面字符串返回预览信息（data-url / http-url / emoji / invalid）
 */
export function getCoverPreviewInfo(cover: string | undefined | null): CoverPreviewInfo {
  if (!cover) {
    return { url: null, isValid: false, type: 'invalid' };
  }
  const trimmed = cover.trim();
  if (trimmed.startsWith('data:')) {
    const isValid = isValidDataUrl(trimmed);
    return {
      url: isValid ? trimmed : null,
      isValid,
      type: isValid ? 'data-url' : 'invalid',
    };
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const isValid = isValidUrl(trimmed);
    return {
      url: isValid ? trimmed : null,
      isValid,
      type: isValid ? 'http-url' : 'invalid',
    };
  }
  if (isValidEmoji(trimmed)) {
    return { url: null, isValid: true, type: 'emoji' };
  }
  return { url: null, isValid: false, type: 'invalid' };
}
