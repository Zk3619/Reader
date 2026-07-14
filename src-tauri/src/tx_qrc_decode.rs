//! QQ 音乐 QRC 歌词解密（hex → 3DES-ECB → zlib inflate）
//!
//! **当前默认不由前端调用**：播放路径走 TS `tx-qrc-decode.ts`。
//! 本模块与 `decode_tx_qrc_lyric` IPC **保留**，供未来切换为「Tauri 为主」的高性能分支
//!（前端入口：`invokeDecodeTxQrc` / 见 `tx-qrc-parse.ts` 注释）。
//!
//! 算法与社区 Lyricify 同源；解密失败时由前端回退普通 LRC。

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use des::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyInit};
use des::TdesEde3;
use ecb::Decryptor;
use flate2::read::ZlibDecoder;
use std::io::Read;

/// Triple DES 需要 24 字节密钥（社区公开 QRC 密钥前 24 字节）
const QRC_KEY: &[u8; 24] = b"!@#)(*$%123ZXC!@!@#)(NYE";

fn hex_to_bytes(hex: &str) -> Result<Vec<u8>, String> {
  let s: String = hex.chars().filter(|c| !c.is_whitespace()).collect();
  if s.is_empty() {
    return Ok(Vec::new());
  }
  if s.len() % 2 != 0 {
    return Err("invalid hex length".into());
  }
  (0..s.len())
    .step_by(2)
    .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| e.to_string()))
    .collect()
}

fn parse_ciphertext(raw: &str) -> Result<Vec<u8>, String> {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return Ok(Vec::new());
  }
  if trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
    return hex_to_bytes(trimmed);
  }
  B64.decode(trimmed).map_err(|e| e.to_string())
}

fn triple_des_ecb_decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
  if data.is_empty() {
    return Ok(Vec::new());
  }
  type Dec = Decryptor<TdesEde3>;
  let decryptor = Dec::new_from_slice(QRC_KEY).map_err(|e| e.to_string())?;
  let mut buf = data.to_vec();
  match decryptor.decrypt_padded_mut::<Pkcs7>(&mut buf) {
    Ok(plain) => Ok(plain.to_vec()),
    Err(_) => {
      if data.len() % 8 != 0 {
        return Err("ciphertext not aligned to DES block".into());
      }
      let mut decryptor = Dec::new_from_slice(QRC_KEY).map_err(|e| e.to_string())?;
      let mut out = data.to_vec();
      for i in (0..out.len()).step_by(8) {
        let block = des::cipher::Block::<TdesEde3>::from_mut_slice(&mut out[i..i + 8]);
        decryptor.decrypt_block_mut(block);
      }
      Ok(out)
    }
  }
}

fn zlib_inflate(data: &[u8]) -> Result<String, String> {
  let mut decoder = ZlibDecoder::new(data);
  let mut out = Vec::new();
  decoder
    .read_to_end(&mut out)
    .map_err(|e| format!("zlib inflate: {e}"))?;
  Ok(String::from_utf8_lossy(&out).into_owned())
}

fn decode_one(raw: &str) -> Result<String, String> {
  if raw.is_empty() {
    return Ok(String::new());
  }
  let bytes = parse_ciphertext(raw)?;
  let plain = triple_des_ecb_decrypt(&bytes)?;
  match zlib_inflate(&plain) {
    Ok(s) if !s.is_empty() => Ok(s),
    _ => {
      let text = String::from_utf8_lossy(&plain).into_owned();
      if text.contains('[') || text.contains("LyricContent") {
        Ok(text)
      } else {
        Err("qrc decrypt failed".into())
      }
    }
  }
}

#[derive(serde::Serialize)]
pub struct TxQrcDecodeResult {
  pub lyric: String,
  pub tlyric: String,
  pub rlyric: String,
}

#[tauri::command]
pub fn decode_tx_qrc_lyric(
  lrc: String,
  tlrc: String,
  rlrc: String,
) -> Result<TxQrcDecodeResult, String> {
  let lyric = decode_one(&lrc)?;
  Ok(TxQrcDecodeResult {
    lyric,
    tlyric: decode_one(&tlrc).unwrap_or_default(),
    rlyric: decode_one(&rlrc).unwrap_or_default(),
  })
}
