/**
 * Native AES port from yt-dlp aes.py (no pycryptodome) — aes_decrypt_text parity.
 */
const BLOCK_SIZE_BYTES = 16;

const RCON: number[] = [141, 1, 2, 4, 8, 16, 32, 64, 128, 27, 54];
const SBOX: number[] = [99, 124, 119, 123, 242, 107, 111, 197, 48, 1, 103, 43, 254, 215, 171, 118, 202, 130, 201, 125, 250, 89, 71, 240, 173, 212, 162, 175, 156, 164, 114, 192, 183, 253, 147, 38, 54, 63, 247, 204, 52, 165, 229, 241, 113, 216, 49, 21, 4, 199, 35, 195, 24, 150, 5, 154, 7, 18, 128, 226, 235, 39, 178, 117, 9, 131, 44, 26, 27, 110, 90, 160, 82, 59, 214, 179, 41, 227, 47, 132, 83, 209, 0, 237, 32, 252, 177, 91, 106, 203, 190, 57, 74, 76, 88, 207, 208, 239, 170, 251, 67, 77, 51, 133, 69, 249, 2, 127, 80, 60, 159, 168, 81, 163, 64, 143, 146, 157, 56, 245, 188, 182, 218, 33, 16, 255, 243, 210, 205, 12, 19, 236, 95, 151, 68, 23, 196, 167, 126, 61, 100, 93, 25, 115, 96, 129, 79, 220, 34, 42, 144, 136, 70, 238, 184, 20, 222, 94, 11, 219, 224, 50, 58, 10, 73, 6, 36, 92, 194, 211, 172, 98, 145, 149, 228, 121, 231, 200, 55, 109, 141, 213, 78, 169, 108, 86, 244, 234, 101, 122, 174, 8, 186, 120, 37, 46, 28, 166, 180, 198, 232, 221, 116, 31, 75, 189, 139, 138, 112, 62, 181, 102, 72, 3, 246, 14, 97, 53, 87, 185, 134, 193, 29, 158, 225, 248, 152, 17, 105, 217, 142, 148, 155, 30, 135, 233, 206, 85, 40, 223, 140, 161, 137, 13, 191, 230, 66, 104, 65, 153, 45, 15, 176, 84, 187, 22];
const SBOX_INV: number[] = [82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251, 124, 227, 57, 130, 155, 47, 255, 135, 52, 142, 67, 68, 196, 222, 233, 203, 84, 123, 148, 50, 166, 194, 35, 61, 238, 76, 149, 11, 66, 250, 195, 78, 8, 46, 161, 102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209, 37, 114, 248, 246, 100, 134, 104, 152, 22, 212, 164, 92, 204, 93, 101, 182, 146, 108, 112, 72, 80, 253, 237, 185, 218, 94, 21, 70, 87, 167, 141, 157, 132, 144, 216, 171, 0, 140, 188, 211, 10, 247, 228, 88, 5, 184, 179, 69, 6, 208, 44, 30, 143, 202, 63, 15, 2, 193, 175, 189, 3, 1, 19, 138, 107, 58, 145, 17, 65, 79, 103, 220, 234, 151, 242, 207, 206, 240, 180, 230, 115, 150, 172, 116, 34, 231, 173, 53, 133, 226, 249, 55, 232, 28, 117, 223, 110, 71, 241, 26, 113, 29, 41, 197, 137, 111, 183, 98, 14, 170, 24, 190, 27, 252, 86, 62, 75, 198, 210, 121, 32, 154, 219, 192, 254, 120, 205, 90, 244, 31, 221, 168, 51, 136, 7, 199, 49, 177, 18, 16, 89, 39, 128, 236, 95, 96, 81, 127, 169, 25, 181, 74, 13, 45, 229, 122, 159, 147, 201, 156, 239, 160, 224, 59, 77, 174, 42, 245, 176, 200, 235, 187, 60, 131, 83, 153, 97, 23, 43, 4, 126, 186, 119, 214, 38, 225, 105, 20, 99, 85, 33, 12, 125];
const RIJNDAEL_EXP_TABLE: number[] = [1, 3, 5, 15, 17, 51, 85, 255, 26, 46, 114, 150, 161, 248, 19, 53, 95, 225, 56, 72, 216, 115, 149, 164, 247, 2, 6, 10, 30, 34, 102, 170, 229, 52, 92, 228, 55, 89, 235, 38, 106, 190, 217, 112, 144, 171, 230, 49, 83, 245, 4, 12, 20, 60, 68, 204, 79, 209, 104, 184, 211, 110, 178, 205, 76, 212, 103, 169, 224, 59, 77, 215, 98, 166, 241, 8, 24, 40, 120, 136, 131, 158, 185, 208, 107, 189, 220, 127, 129, 152, 179, 206, 73, 219, 118, 154, 181, 196, 87, 249, 16, 48, 80, 240, 11, 29, 39, 105, 187, 214, 97, 163, 254, 25, 43, 125, 135, 146, 173, 236, 47, 113, 147, 174, 233, 32, 96, 160, 251, 22, 58, 78, 210, 109, 183, 194, 93, 231, 50, 86, 250, 21, 63, 65, 195, 94, 226, 61, 71, 201, 64, 192, 91, 237, 44, 116, 156, 191, 218, 117, 159, 186, 213, 100, 172, 239, 42, 126, 130, 157, 188, 223, 122, 142, 137, 128, 155, 182, 193, 88, 232, 35, 101, 175, 234, 37, 111, 177, 200, 67, 197, 84, 252, 31, 33, 99, 165, 244, 7, 9, 27, 45, 119, 153, 176, 203, 70, 202, 69, 207, 74, 222, 121, 139, 134, 145, 168, 227, 62, 66, 198, 81, 243, 14, 18, 54, 90, 238, 41, 123, 141, 140, 143, 138, 133, 148, 167, 242, 13, 23, 57, 75, 221, 124, 132, 151, 162, 253, 28, 36, 108, 180, 199, 82, 246, 1];
const RIJNDAEL_LOG_TABLE: number[] = [0, 0, 25, 1, 50, 2, 26, 198, 75, 199, 27, 104, 51, 238, 223, 3, 100, 4, 224, 14, 52, 141, 129, 239, 76, 113, 8, 200, 248, 105, 28, 193, 125, 194, 29, 181, 249, 185, 39, 106, 77, 228, 166, 114, 154, 201, 9, 120, 101, 47, 138, 5, 33, 15, 225, 36, 18, 240, 130, 69, 53, 147, 218, 142, 150, 143, 219, 189, 54, 208, 206, 148, 19, 92, 210, 241, 64, 70, 131, 56, 102, 221, 253, 48, 191, 6, 139, 98, 179, 37, 226, 152, 34, 136, 145, 16, 126, 110, 72, 195, 163, 182, 30, 66, 58, 107, 40, 84, 250, 133, 61, 186, 43, 121, 10, 21, 155, 159, 94, 202, 78, 212, 172, 229, 243, 115, 167, 87, 175, 88, 168, 80, 244, 234, 214, 116, 79, 174, 233, 213, 231, 230, 173, 232, 44, 215, 117, 122, 235, 22, 11, 245, 89, 203, 95, 176, 156, 169, 81, 160, 127, 12, 246, 111, 23, 196, 73, 236, 216, 67, 31, 45, 164, 118, 123, 183, 204, 187, 62, 90, 251, 96, 177, 134, 59, 82, 161, 108, 170, 85, 41, 157, 151, 178, 135, 144, 97, 190, 220, 252, 188, 149, 207, 205, 55, 63, 91, 209, 83, 57, 132, 60, 65, 162, 109, 71, 20, 42, 158, 93, 86, 242, 211, 171, 68, 17, 146, 217, 35, 32, 46, 137, 180, 124, 184, 38, 119, 153, 227, 165, 103, 74, 237, 222, 197, 49, 254, 24, 13, 99, 140, 128, 192, 247, 112, 7];

const MIX_COLUMN_MATRIX: number[][] = [
  [0x2, 0x3, 0x1, 0x1],
  [0x1, 0x2, 0x3, 0x1],
  [0x1, 0x1, 0x2, 0x3],
  [0x3, 0x1, 0x1, 0x2],
];
const MIX_COLUMN_MATRIX_INV: number[][] = [
  [0xE, 0xB, 0xD, 0x9],
  [0x9, 0xE, 0xB, 0xD],
  [0xD, 0x9, 0xE, 0xB],
  [0xB, 0xD, 0x9, 0xE],
];

function xor(a: number[], b: number[]): number[] {
  return a.map((x, i) => x ^ b[i]!);
}

function inc(data: number[]): number[] {
  const d = [...data];
  for (let i = d.length - 1; i >= 0; i--) {
    if (d[i] === 255) d[i] = 0;
    else {
      d[i]! += 1;
      break;
    }
  }
  return d;
}

function* iterVector(iv: number[]): Generator<number[]> {
  let cur = iv;
  while (true) {
    yield cur;
    cur = inc(cur);
  }
}

function subBytes(data: number[]): number[] {
  return data.map((x) => SBOX[x]!);
}

function subBytesInv(data: number[]): number[] {
  return data.map((x) => SBOX_INV[x]!);
}

function rotate(data: number[]): number[] {
  return [...data.slice(1), data[0]!];
}

function keyScheduleCore(data: number[], rconIteration: number): number[] {
  const d = rotate([...data]);
  const out = subBytes(d);
  out[0] ^= RCON[rconIteration]!;
  return out;
}

function keyExpansion(data: number[]): number[] {
  const out = [...data];
  let rconIteration = 1;
  const keySizeBytes = data.length;
  const expandedKeySizeBytes = ((keySizeBytes >> 2) + 7) * BLOCK_SIZE_BYTES;
  while (out.length < expandedKeySizeBytes) {
    let temp = keyScheduleCore(out.slice(-4), rconIteration);
    rconIteration += 1;
    out.push(...xor(temp, out.slice(-keySizeBytes, 4 - keySizeBytes)));
    for (let i = 0; i < 3; i++) {
      temp = out.slice(-4);
      out.push(...xor(temp, out.slice(-keySizeBytes, 4 - keySizeBytes)));
    }
    if (keySizeBytes === 32) {
      temp = subBytes(out.slice(-4));
      out.push(...xor(temp, out.slice(-keySizeBytes, 4 - keySizeBytes)));
    }
    const extra = keySizeBytes === 32 ? 3 : keySizeBytes === 24 ? 2 : 0;
    for (let i = 0; i < extra; i++) {
      temp = out.slice(-4);
      out.push(...xor(temp, out.slice(-keySizeBytes, 4 - keySizeBytes)));
    }
  }
  return out.slice(0, expandedKeySizeBytes);
}

function* iterMixColumns(data: number[], matrix: readonly number[][]): Generator<number> {
  for (let i = 0; i < 16; i += 4) {
    for (const row of matrix) {
      let mixed = 0;
      for (let j = 0; j < 4; j++) {
        const v = data[i + j]!;
        const m = row[j]!;
        mixed ^= v === 0 || m === 0 ? 0 : RIJNDAEL_EXP_TABLE[(RIJNDAEL_LOG_TABLE[v]! + RIJNDAEL_LOG_TABLE[m]!) % 0xff]!;
      }
      yield mixed;
    }
  }
}

function shiftRows(data: number[]): number[] {
  const out: number[] = [];
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      out.push(data[((column + row) & 3) * 4 + row]!);
    }
  }
  return out;
}

function shiftRowsInv(data: number[]): number[] {
  const out: number[] = [];
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      out.push(data[((column - row) & 3) * 4 + row]!);
    }
  }
  return out;
}

function aesEncrypt(data: number[], expandedKey: number[]): number[] {
  const rounds = expandedKey.length / BLOCK_SIZE_BYTES - 1;
  let state = xor(data, expandedKey.slice(0, BLOCK_SIZE_BYTES));
  for (let i = 1; i <= rounds; i++) {
    state = subBytes(state);
    state = shiftRows(state);
    if (i !== rounds) state = [...iterMixColumns(state, MIX_COLUMN_MATRIX)];
    state = xor(state, expandedKey.slice(i * BLOCK_SIZE_BYTES, (i + 1) * BLOCK_SIZE_BYTES));
  }
  return state;
}

/** CBC AES decrypt (kept for yt-dlp AES parity; CTR path uses encrypt XOR). */
export function aesDecrypt(data: number[], expandedKey: number[]): number[] {
  const rounds = expandedKey.length / BLOCK_SIZE_BYTES - 1;
  let state = [...data];
  for (let i = rounds; i > 0; i--) {
    state = xor(state, expandedKey.slice(i * BLOCK_SIZE_BYTES, (i + 1) * BLOCK_SIZE_BYTES));
    if (i !== rounds) state = [...iterMixColumns(state, MIX_COLUMN_MATRIX_INV)];
    state = shiftRowsInv(state);
    state = subBytesInv(state);
  }
  return xor(state, expandedKey.slice(0, BLOCK_SIZE_BYTES));
}

function aesCtrEncrypt(data: number[], key: number[], iv: number[]): number[] {
  const expandedKey = keyExpansion(key);
  const blockCount = Math.ceil(data.length / BLOCK_SIZE_BYTES);
  const counter = iterVector(iv);
  const encrypted: number[] = [];
  for (let i = 0; i < blockCount; i++) {
    const counterBlock = counter.next().value!;
    const block = data.slice(i * BLOCK_SIZE_BYTES, (i + 1) * BLOCK_SIZE_BYTES);
    const padded = [...block, ...Array(BLOCK_SIZE_BYTES - block.length).fill(0)];
    const cipherCounter = aesEncrypt(counterBlock, expandedKey);
    encrypted.push(...xor(padded, cipherCounter));
  }
  return encrypted.slice(0, data.length);
}

function aesCtrDecrypt(data: number[], key: number[], iv: number[]): number[] {
  return aesCtrEncrypt(data, key, iv);
}

export function aesDecryptTextNative(
  data: string,
  password: string,
  keySizeBytes: 16 | 24 | 32 = 32,
): string {
  const NONCE_LENGTH_BYTES = 8;
  const raw = [...Uint8Array.from(atob(data), (c) => c.charCodeAt(0))];
  const pwd = [...new TextEncoder().encode(password)];
  let key = [...pwd.slice(0, keySizeBytes), ...Array(Math.max(0, keySizeBytes - pwd.length)).fill(0)];
  const encBlock = aesEncrypt(key.slice(0, BLOCK_SIZE_BYTES), keyExpansion(key));
  key = [];
  for (let i = 0; i < keySizeBytes / BLOCK_SIZE_BYTES; i++) key.push(...encBlock);
  const nonce = raw.slice(0, NONCE_LENGTH_BYTES);
  const cipher = raw.slice(NONCE_LENGTH_BYTES);
  const decrypted = aesCtrDecrypt(cipher, key, [...nonce, ...Array(BLOCK_SIZE_BYTES - nonce.length).fill(0)]);
  return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(decrypted));
}
