"""Generate aes-ytdlp-native.ts from yt-dlp aes.py tables + minimal port."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
AES_PY = ROOT.parent / "Download" / "yt-dlp-master" / "yt_dlp" / "aes.py"
OUT = ROOT / "src" / "lib" / "download" / "ytdlp" / "aes-ytdlp-native.ts"

code = AES_PY.read_text(encoding="utf-8")
# Extract table constants
import re

def extract_tuple(name: str) -> str:
    m = re.search(rf"{name}\s*=\s*\((.*?)\)\s*(?:\n|$)", code, re.S)
    if not m:
        raise SystemExit(f"missing {name}")
    inner = m.group(1)
    nums = [int(x.strip(), 0) for x in re.findall(r"0x[0-9a-fA-F]+|\d+", inner)]
    return f"const {name}: number[] = [{', '.join(map(str, nums))}];"

tables = [
    "RCON",
    "SBOX",
    "SBOX_INV",
    "RIJNDAEL_EXP_TABLE",
    "RIJNDAEL_LOG_TABLE",
]

header = """/**
 * Native AES port from yt-dlp aes.py (no pycryptodome) — aes_decrypt_text parity.
 */
const BLOCK_SIZE_BYTES = 16;

"""

body = """
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

function aesDecrypt(data: number[], expandedKey: number[]): number[] {
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
    const cipherCounter = aesEncrypt(padded, expandedKey);
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
"""

matrix_defs = """
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
"""

table_lines = [extract_tuple(t) for t in tables]
OUT.write_text(header + "\n".join(table_lines) + "\n" + matrix_defs + body, encoding="utf-8")
print(f"Wrote {OUT}")
