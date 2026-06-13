/**
 * 网络字体加载（对齐 Legado ReadSettings loadFontFromURL）
 */

export async function loadNetworkFont(fontName: string, url: string): Promise<void> {
  if (!fontName.trim()) throw new Error('请先填写字体名称');
  if (!/^https?:\/\/.+/i.test(url.trim())) throw new Error('URL 形式不正确');
  if (typeof FontFace !== 'function') throw new Error('浏览器不支持 FontFace');

  const face = new FontFace(fontName.trim(), `url("${url.trim()}")`);
  document.fonts.add(face);
  await face.load();
}
