import { isMobile } from '@/lib/platform/detect';

/** getUserMedia 视频约束：移动端优先后置，桌面/Web 使用前置摄像头 */
export function buildCameraVideoConstraints(): MediaTrackConstraints {
  if (isMobile()) {
    return {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };
  }
  return {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };
}
