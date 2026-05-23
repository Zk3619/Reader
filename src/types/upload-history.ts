/** 上传历史，对应 legado UploadHistory.kt */
export interface UploadHistory {
  id?: number;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadTime: number;
  duration: number;
  downloadUrl: string;
  expireTime?: number;
  ruleId: number;
  ruleSummary: string;
  success: boolean;
  errorMsg?: string;
}
