/**
 * QQ 音乐 zzc 签名（对齐 lx-music tx/utils/crypto.js）
 */

import CryptoJS from 'crypto-js';

const PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19];
const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5];
const SCRAMBLE_VALUES = [
  89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121,
  179,
];

function pickHashByIdx(hash: string, indexes: number[]): string {
  return indexes.map((idx) => hash[idx]).join('');
}

function base64EncodeScramble(bytes: number[]): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/[\\/+=]/g, '');
}

export function zzcSign(text: string): string {
  const hash = CryptoJS.SHA1(text).toString();
  const part1 = pickHashByIdx(hash, PART_1_INDEXES);
  const part2 = pickHashByIdx(hash, PART_2_INDEXES);
  const part3 = SCRAMBLE_VALUES.map(
    (value, i) => value ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16),
  );
  const b64Part = base64EncodeScramble(part3);
  return `zzc${part1}${b64Part}${part2}`.toLowerCase();
}
