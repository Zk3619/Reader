import { describe, expect, it } from 'vitest';
import {
  buildLyricTextShadow,
  buildLyricTextStrokeStyle,
  buildLyricTextEffectStyle,
  buildLyricTextGlow,
  lyricColorLuminance,
  shadowFontModeColor,
} from '@/lib/media/audio/lyric-text-shadow';

describe('lyric-text-shadow', () => {
  it('lyricColorLuminance estimates light colors', () => {
    expect(lyricColorLuminance('#ffffff')).toBeGreaterThan(0.9);
    expect(lyricColorLuminance('rgba(255,255,255,0.5)')).toBeGreaterThan(0.55);
    expect(lyricColorLuminance('#111111')).toBeLessThan(0.2);
  });

  it('shadowFontModeColor matches LX RGB_Alpha_Shade(0.49)', () => {
    expect(shadowFontModeColor('rgba(0, 0, 0, 0.18)')).toBe('rgba(0,0,0,0.09)');
  });

  it('buildLyricTextStrokeStyle uses single webkit-text-stroke on transparent backdrop', () => {
    const style = buildLyricTextStrokeStyle({
      enabled: true,
      shadowColor: 'rgba(0, 0, 0, 0.18)',
      mode: 'line',
      direction: 'horizontal',
    });
    expect(style?.['-webkit-text-stroke']).toBe('0.04em rgba(0,0,0,0.09)');
    expect(style?.['paint-order']).toBe('stroke fill');
  });

  it('buildLyricTextEffectStyle combines stroke and glow on transparent backdrop', () => {
    const style = buildLyricTextEffectStyle({
      enabled: true,
      shadowColor: 'rgba(0, 0, 0, 0.18)',
      transparentBackdrop: true,
      mode: 'line',
      direction: 'horizontal',
    });
    expect(style?.['-webkit-text-stroke']).toBe('0.04em rgba(0,0,0,0.09)');
    expect(style?.['text-shadow']).toContain('0 0 8px');
  });

  it('buildLyricTextGlow produces lighter capsule-style halo', () => {
    const glow = buildLyricTextGlow('rgba(0, 0, 0, 0.18)');
    expect(glow).toContain('0 0 0 0.5px');
    expect(glow).toContain('0 0 8px');
    expect(glow).toContain('0 0 3px');
  });

  it('buildLyricTextShadow uses stroke3 for horizontal line mode', () => {
    const shadow = buildLyricTextShadow({
      enabled: true,
      shadowColor: 'rgba(0, 0, 0, 0.18)',
      transparentBackdrop: true,
      mode: 'line',
      direction: 'horizontal',
    });
    expect(shadow).toContain('0.04em 0.04em 0 rgba(0,0,0,0.09)');
    expect(shadow).not.toContain('4px');
  });

  it('buildLyricTextShadow uses stroke4 for vertical line mode', () => {
    const shadow = buildLyricTextShadow({
      enabled: true,
      shadowColor: 'rgba(0, 0, 0, 0.18)',
      transparentBackdrop: true,
      mode: 'line',
      direction: 'vertical',
    });
    expect(shadow).toContain('-1px -1px 0 rgba(0, 0, 0, 0.18)');
    expect(shadow).toContain('0.02em -0.02em 0 rgba(0, 0, 0, 0.18)');
  });

  it('buildLyricTextShadow uses stroke1px for font mode', () => {
    const shadow = buildLyricTextShadow({
      enabled: true,
      shadowColor: 'rgba(0, 0, 0, 0.18)',
      transparentBackdrop: true,
      mode: 'font',
    });
    expect(shadow).toContain('1px 1px 0 rgba(0,0,0,0.09)');
    expect(shadow).toContain('0 0 0 rgba(0,0,0,0.09)');
  });

  it('buildLyricTextShadow keeps soft shadow in opaque contexts', () => {
    expect(
      buildLyricTextShadow({
        enabled: true,
        shadowColor: 'rgba(0, 0, 0, 0.18)',
        transparentBackdrop: false,
      }),
    ).toBe('0 1px 4px rgba(0, 0, 0, 0.18)');
  });
});
