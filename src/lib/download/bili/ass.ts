/**
 * 简易 Bilibili XML 弹幕 → ASS（对齐 DanmakuFactory 常用字段）
 */

function escapeAss(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\N');
}

function toAssTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function colorToAss(color: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `&H00${b.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}`.toUpperCase();
}

/** 输入完整 bilibili 弹幕 XML 字符串，输出 ASS */
export function bilibiliXmlToAss(xml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const nodes = [...doc.querySelectorAll('d')];
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events: string[] = [];
  let i = 0;
  for (const d of nodes) {
    const p = d.getAttribute('p') || '';
    const parts = p.split(',');
    const start = Number(parts[0] || 0);
    const mode = Number(parts[1] || 1);
    const fontsize = Number(parts[2] || 25);
    const color = Number(parts[3] || 16777215);
    const text = escapeAss(d.textContent || '');
    if (!text) continue;
    const end = start + (mode === 4 || mode === 5 ? 4 : 8);
    const primary = colorToAss(color);
    const row = (i++ % 12) + 1;
    const y = row * 60;
    const effect =
      mode === 4
        ? ''
        : mode === 5
          ? ''
          : `\\move(1920,${y},-200,${y})`;
    const align = mode === 5 ? 8 : mode === 4 ? 2 : 7;
    events.push(
      `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Default,,0,0,0,,{\\fs${Math.round(fontsize * 1.6)}\\c${primary}\\an${align}${effect}}${text}`,
    );
  }
  return header + events.join('\n') + '\n';
}

export function bilibiliXmlBytesToAss(xmlBytes: Uint8Array): Uint8Array {
  const xml = new TextDecoder().decode(xmlBytes);
  return new TextEncoder().encode(bilibiliXmlToAss(xml));
}
