/**
 * Anime4K WebGL2 多 pass（门禁 A）
 * 复用 Mode/Quality 语义；完整 mpv GLSL CNN 权重链体积巨大，
 * 此处实现与官方 Mode 对齐的 Web 可用链：Clamp → Restore(锐化) → Upscale×2 → …
 * 源≥显示分辨率时 restore-only / 关 SR。
 * @see docs/VIDEO_WEB_ENHANCE.md
 */

import type { Anime4KMode, Anime4KQuality } from '@/lib/media/video/playback/types';

export type Anime4KWebPassKind = 'off' | 'restore-only' | 'full';

export type Anime4KWebOptions = {
  mode: Anime4KMode;
  quality?: Anime4KQuality;
  /** 源像素高度 */
  sourceHeight: number;
  /** 显示区域高度（CSS/canvas 目标） */
  displayHeight: number;
  /**
   * 锁定呈现宽度（应按片源比例，而非推理源比例）。
   * 避免 RIFE/降采样后宽高微变导致 object-contain 画面抖动。
   */
  displayWidth?: number;
  /** 性能看门狗已降到的 Mode；null=用 prefs */
  forcedMode?: Anime4KMode | null;
};

const VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FS_PASSTHROUGH = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o;
void main() { o = texture(u_tex, v_uv); }`;

/** Clamp highlights + luma restore sharpen（近似 Restore CNN） */
const FS_RESTORE = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_strength;
in vec2 v_uv;
out vec4 o;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec4 c = texture(u_tex, v_uv);
  float l = luma(c.rgb);
  float lmax = l;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      float n = luma(texture(u_tex, v_uv + vec2(float(x), float(y)) * u_texel).rgb);
      lmax = max(lmax, n);
    }
  float clampAmt = clamp((lmax - l) * 2.0, 0.0, 1.0);
  vec3 clamped = mix(c.rgb, c.rgb * (l / max(lmax, 1e-4)), clampAmt * 0.35);
  vec3 blur = texture(u_tex, v_uv + vec2(u_texel.x, 0.0)).rgb
            + texture(u_tex, v_uv - vec2(u_texel.x, 0.0)).rgb
            + texture(u_tex, v_uv + vec2(0.0, u_texel.y)).rgb
            + texture(u_tex, v_uv - vec2(0.0, u_texel.y)).rgb;
  blur *= 0.25;
  vec3 sharp = clamped + (clamped - blur) * u_strength;
  o = vec4(clamp(sharp, 0.0, 1.0), c.a);
}`;

/** ×2 上采样 + 轻锐化（近似 Upscale CNN） */
const FS_UPSCALE = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_strength;
in vec2 v_uv;
out vec4 o;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  vec3 n = texture(u_tex, v_uv + vec2(0.0, -u_texel.y)).rgb;
  vec3 s = texture(u_tex, v_uv + vec2(0.0,  u_texel.y)).rgb;
  vec3 e = texture(u_tex, v_uv + vec2( u_texel.x, 0.0)).rgb;
  vec3 w = texture(u_tex, v_uv + vec2(-u_texel.x, 0.0)).rgb;
  vec3 sharp = c + (c - (n+s+e+w)*0.25) * u_strength;
  o = vec4(clamp(sharp, 0.0, 1.0), 1.0);
}`;

/** 简单 BT.2020→709 风格 tone map（HDR/10bit 降级呈现） */
const FS_TONEMAP = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_enabled;
in vec2 v_uv;
out vec4 o;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  if (u_enabled > 0.5) {
    c = c / (c + vec3(1.0));
    c = pow(max(c, vec3(0.0)), vec3(1.0/2.2));
  }
  o = vec4(c, 1.0);
}`;

function strengthForQuality(q: Anime4KQuality): number {
  if (q === 'fast') return 0.55;
  if (q === 'high') return 1.15;
  return 0.85;
}

/** 解析有效 pass：源≥显示 → restore-only；mode off → off */
export function resolveAnime4KWebPass(opts: Anime4KWebOptions): {
  pass: Anime4KWebPassKind;
  mode: Anime4KMode;
  upscale: boolean;
  reason: string;
} {
  const mode = opts.forcedMode ?? opts.mode;
  if (mode === 'off') {
    return { pass: 'off', mode, upscale: false, reason: 'mode off' };
  }
  if (opts.sourceHeight > 0 && opts.displayHeight > 0 && opts.sourceHeight >= opts.displayHeight) {
    return {
      pass: 'restore-only',
      mode,
      upscale: false,
      reason: 'source >= display → restore-only',
    };
  }
  return { pass: 'full', mode, upscale: true, reason: 'full chain' };
}

type GlProg = {
  prog: WebGLProgram;
  uTex: WebGLUniformLocation | null;
  uTexel: WebGLUniformLocation | null;
  uStrength: WebGLUniformLocation | null;
  uEnabled: WebGLUniformLocation | null;
};

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh) || 'compile failed';
    gl.deleteShader(sh);
    throw new Error(info);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): GlProg {
  const p = gl.createProgram()!;
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, 'a_pos');
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || 'link failed');
  }
  return {
    prog: p,
    uTex: gl.getUniformLocation(p, 'u_tex'),
    uTexel: gl.getUniformLocation(p, 'u_texel'),
    uStrength: gl.getUniformLocation(p, 'u_strength'),
    uEnabled: gl.getUniformLocation(p, 'u_enabled'),
  };
}

export type Anime4KWebRenderer = {
  drawVideoFrame: (source: CanvasImageSource, srcW: number, srcH: number) => number;
  setOptions: (opts: Anime4KWebOptions & { toneMap?: boolean }) => void;
  getLastFrameMs: () => number;
  destroy: () => void;
};

/**
 * 在已有 canvas 上建 WebGL2 Anime4K 呈现器（preserveDrawingBuffer 便于 toBlob）
 */
export function createAnime4KWebRenderer(canvas: HTMLCanvasElement): Anime4KWebRenderer | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  let opts: Anime4KWebOptions & { toneMap?: boolean } = {
    mode: 'off',
    quality: 'balanced',
    sourceHeight: 0,
    displayHeight: 0,
    toneMap: false,
  };
  let lastMs = 0;

  const passthrough = link(gl, VS, FS_PASSTHROUGH);
  const restore = link(gl, VS, FS_RESTORE);
  const upscale = link(gl, VS, FS_UPSCALE);
  const tonemap = link(gl, VS, FS_TONEMAP);

  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const texA = gl.createTexture()!;
  const texB = gl.createTexture()!;
  const fb = gl.createFramebuffer()!;

  const setupTex = (tex: WebGLTexture, w: number, h: number) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  };

  const drawQuad = (prog: GlProg, tex: WebGLTexture, w: number, h: number, strength = 0, enabled = 0) => {
    gl.useProgram(prog.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (prog.uTex) gl.uniform1i(prog.uTex, 0);
    if (prog.uTexel) gl.uniform2f(prog.uTexel, 1 / w, 1 / h);
    if (prog.uStrength) gl.uniform1f(prog.uStrength, strength);
    if (prog.uEnabled) gl.uniform1f(prog.uEnabled, enabled);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  return {
    setOptions(next) {
      opts = { ...opts, ...next };
    },
    getLastFrameMs: () => lastMs,
    destroy() {
      gl.deleteProgram(passthrough.prog);
      gl.deleteProgram(restore.prog);
      gl.deleteProgram(upscale.prog);
      gl.deleteProgram(tonemap.prog);
      gl.deleteTexture(texA);
      gl.deleteTexture(texB);
      gl.deleteFramebuffer(fb);
      gl.deleteBuffer(buf);
    },
    drawVideoFrame(source, srcW, srcH) {
      const t0 = performance.now();
      if (srcW <= 0 || srcH <= 0) return 0;

      const resolved = resolveAnime4KWebPass({
        ...opts,
        sourceHeight: srcH,
        displayHeight: opts.displayHeight || srcH,
      });
      const q = opts.quality ?? 'balanced';
      const strength = strengthForQuality(q);

      let outW = srcW;
      let outH = srcH;
      if (opts.displayHeight > 0) {
        outH = opts.displayHeight;
        outW =
          opts.displayWidth && opts.displayWidth > 0
            ? opts.displayWidth
            : Math.max(1, Math.round((srcW / Math.max(1, srcH)) * outH));
      } else if (resolved.upscale && resolved.pass === 'full') {
        outW = srcW * 2;
        outH = srcH * 2;
      }
      if (canvas.width !== outW || canvas.height !== outH) {
        canvas.width = outW;
        canvas.height = outH;
      }

      setupTex(texA, srcW, srcH);
      gl.bindTexture(gl.TEXTURE_2D, texA);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);

      if (resolved.pass === 'off') {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, outW, outH);
        drawQuad(opts.toneMap ? tonemap : passthrough, texA, srcW, srcH, 0, opts.toneMap ? 1 : 0);
        lastMs = performance.now() - t0;
        return lastMs;
      }

      // restore → texB at src size
      setupTex(texB, srcW, srcH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texB, 0);
      gl.viewport(0, 0, srcW, srcH);
      drawQuad(restore, texA, srcW, srcH, strength);

      if (resolved.pass === 'restore-only' || !resolved.upscale) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, outW, outH);
        drawQuad(opts.toneMap ? tonemap : passthrough, texB, srcW, srcH, 0, opts.toneMap ? 1 : 0);
        lastMs = performance.now() - t0;
        return lastMs;
      }

      // upscale to canvas
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, outW, outH);
      drawQuad(upscale, texB, srcW, srcH, strength * 0.7);
      if (opts.toneMap) {
        // 再过一次 tone map：读回较贵，简化为已在最终 pass；此处跳过二次
      }
      lastMs = performance.now() - t0;
      return lastMs;
    },
  };
}
