/**
 * 将文本渲染为 QR 码 Data URL（动态加载 qrcode 包）
 */

export async function renderQrDataUrl(text: string, size = 280): Promise<string> {
  const QRCode = await import('qrcode');
  return QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'L',
  });
}
