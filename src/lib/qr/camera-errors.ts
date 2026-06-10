import { isAndroid, isMacOS, isTauri } from '@/lib/platform/detect';

export function isCameraPermissionError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError';
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      error.name === 'NotAllowedError' ||
      error.name === 'PermissionDeniedError' ||
      msg.includes('permission') ||
      msg.includes('not allowed') ||
      msg.includes('denied')
    );
  }
  return false;
}

export function isCameraNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

export function getCameraPermissionErrorMessage(): string {
  if (isTauri() && isAndroid()) {
    return '未获得摄像头权限，请在系统「设置 → 应用 → Reader」中允许访问摄像头';
  }
  if (isTauri() && isMacOS()) {
    return '未获得摄像头权限，请在「系统设置 → 隐私与安全性 → 摄像头」中允许本应用访问';
  }
  if (isTauri()) {
    return '未获得摄像头权限，请在系统设置中允许本应用访问摄像头';
  }
  return '未获得摄像头权限，请在浏览器或网页设置中允许访问摄像头';
}

export function getCameraStartErrorMessage(error: unknown): string {
  if (isCameraNotFoundError(error)) {
    return '未检测到可用摄像头，请检查设备连接或改用「选择图片识别」';
  }
  if (isCameraPermissionError(error)) {
    return getCameraPermissionErrorMessage();
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '无法打开摄像头';
}

export function getCameraInputUnavailableMessage(): string {
  if (isTauri()) {
    return '当前环境无法调用摄像头，请确认系统已授权摄像头权限后重试';
  }
  return '当前环境不支持摄像头（需 HTTPS 或 localhost）';
}
