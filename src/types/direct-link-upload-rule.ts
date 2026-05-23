/** 直链上传规则，对应 legado DirectLinkUploadRule.kt */
export interface DirectLinkUploadRule {
  id?: number;
  uploadUrl: string;
  downloadUrlRule: string;
  summary: string;
  compress: boolean;
  customHeaders?: string;
  timeout: number;
  retryCount: number;
  sortOrder: number;
  isDefault: boolean;
  uploadCount: number;
  lastUsedTime: number;
  createTime: number;
  updateTime: number;
}
