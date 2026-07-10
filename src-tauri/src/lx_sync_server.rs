//! LX Sync Server v4（/hello、/id、/ah、WS 认证、message2call、持久化）

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod imp {
    use std::collections::HashMap;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::{Arc, Mutex};
    use std::thread::{self, JoinHandle};

    use aes::Aes128;
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
    use ecb::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyInit};
    use flate2::read::GzDecoder;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use futures_util::{SinkExt, StreamExt};
    use md5::{Digest, Md5};
    use rand::rngs::OsRng;
    use rsa::pkcs8::{DecodePublicKey, EncodePrivateKey};
    use rsa::{Oaep, RsaPrivateKey, RsaPublicKey};
    use serde::{Deserialize, Serialize};
    use serde_json::{json, Value};
    use sha2::Sha256;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::{TcpListener, TcpStream};
    use tokio::sync::Mutex as AsyncMutex;
    use tokio_tungstenite::accept_hdr_async;
    use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
    use uuid::Uuid;

    type Aes128EcbEnc = ecb::Encryptor<Aes128>;
    type Aes128EcbDec = ecb::Decryptor<Aes128>;

    const HELLO_MSG: &str = "Hello~::^-^::~v4~";
    const ID_PREFIX: &str = "OjppZDo6";
    const AUTH_MSG: &str = "lx-music auth::";
    const CONNECT_MSG: &str = "lx-music connect";
    const AUTH_FAILED: &str = "Auth failed";

    static RUNNING: AtomicBool = AtomicBool::new(false);
    static HANDLE: std::sync::OnceLock<Mutex<Option<JoinHandle<()>>>> = std::sync::OnceLock::new();
    static DATA_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
    static MSG_ID: AtomicU64 = AtomicU64::new(0);

    #[derive(Clone, Serialize, Deserialize, Default)]
    struct ClientKeyInfo {
        client_id: String,
        key: String,
        device_name: String,
        #[serde(default)]
        is_mobile: bool,
        #[serde(default)]
        last_connect_date: u64,
    }

    #[derive(Clone, Serialize, Deserialize, Default)]
    struct SyncStore {
        list_data: Value,
        dislike_data: String,
        devices: HashMap<String, ClientKeyInfo>,
        client_user: HashMap<String, String>,
        server_id: String,
        #[serde(skip)]
        rsa_private: Option<String>,
    }

    fn password_aes_key(password: &str) -> String {
        let mut hasher = Md5::new();
        hasher.update(password.as_bytes());
        let hex = format!("{:x}", hasher.finalize());
        B64.encode(&hex.as_bytes()[..16])
    }

    fn aes_key_bytes(key_b64: &str) -> [u8; 16] {
        let raw = B64.decode(key_b64).unwrap_or_default();
        let mut key = [0u8; 16];
        let len = raw.len().min(16);
        key[..len].copy_from_slice(&raw[..len]);
        key
    }

    fn aes_encrypt(text: &str, key_b64: &str) -> String {
        let key = aes_key_bytes(key_b64);
        let cipher = Aes128EcbEnc::new(&key.into());
        let mut buf = vec![0u8; text.len() + 16];
        let len = cipher
            .encrypt_padded_b2b_mut::<Pkcs7>(text.as_bytes(), &mut buf)
            .map(|s| s.len())
            .unwrap_or(0);
        B64.encode(&buf[..len])
    }

    fn aes_decrypt(text: &str, key_b64: &str) -> Result<String, String> {
        let key = aes_key_bytes(key_b64);
        let raw = B64.decode(text.trim()).map_err(|e| format!("b64: {e}"))?;
        let cipher = Aes128EcbDec::new(&key.into());
        let mut buf = raw;
        let plain = cipher
            .decrypt_padded_mut::<Pkcs7>(&mut buf)
            .map_err(|e| format!("decrypt: {e}"))?;
        String::from_utf8(plain.to_vec()).map_err(|e| format!("utf8: {e}"))
    }

    fn decrypt_msg(text: &str, key_b64: &str) -> Result<String, String> {
        if text.starts_with("cg_") {
            let raw = B64.decode(text.trim_start_matches("cg_")).map_err(|e| format!("gzip b64: {e}"))?;
            let mut decoder = GzDecoder::new(&raw[..]);
            let mut out = String::new();
            std::io::Read::read_to_string(&mut decoder, &mut out).map_err(|e| format!("gunzip: {e}"))?;
            return Ok(out);
        }
        aes_decrypt(text, key_b64)
    }

    fn encrypt_msg(text: &str, key_b64: &str) -> String {
        if text.len() > 1024 {
            let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
            use std::io::Write;
            let _ = encoder.write_all(text.as_bytes());
            if let Ok(buf) = encoder.finish() {
                return format!("cg_{}", B64.encode(buf));
            }
        }
        aes_encrypt(text, key_b64)
    }

    fn md5_hex(text: &str) -> String {
        let mut hasher = Md5::new();
        hasher.update(text.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    fn rsa_encrypt(plain: &str, public_pem: &str) -> Result<String, String> {
        let pub_key = RsaPublicKey::from_public_key_pem(public_pem).map_err(|e| e.to_string())?;
        let padding = Oaep::new::<Sha256>();
        let mut rng = OsRng;
        let enc = pub_key
            .encrypt(&mut rng, padding, plain.as_bytes())
            .map_err(|e| e.to_string())?;
        Ok(B64.encode(enc))
    }

    fn store_path() -> PathBuf {
        DATA_DIR.get().cloned().unwrap_or_else(|| PathBuf::from(".")).join("sync")
    }

    fn load_store(password: &str) -> SyncStore {
        let dir = store_path();
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("store.json");
        let mut store: SyncStore = if path.exists() {
            fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            SyncStore::default()
        };
        if store.server_id.is_empty() {
            store.server_id = Uuid::new_v4().simple().to_string();
        }
        if store.list_data.is_null() {
            store.list_data = json!({
                "defaultList": [],
                "loveList": [],
                "userList": []
            });
        }
        if store.rsa_private.is_none() {
            let mut rng = OsRng;
            let priv_key = RsaPrivateKey::new(&mut rng, 2048).expect("rsa key");
            let priv_pem = priv_key.to_pkcs8_pem(rsa::pkcs8::LineEnding::LF).expect("pem");
            store.rsa_private = Some(priv_pem.to_string());
        }
        let _ = password;
        store
    }

    fn save_store(store: &SyncStore) {
        let dir = store_path();
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("store.json");
        if let Ok(s) = serde_json::to_string_pretty(store) {
            let _ = fs::write(path, s);
        }
    }

    fn create_client_key(device_name: &str, is_mobile: bool) -> ClientKeyInfo {
        let key: String = (0..16)
            .map(|_| {
                let v: u8 = rand::random();
                (b'a' + (v % 26)) as char
            })
            .collect();
        ClientKeyInfo {
            client_id: Uuid::new_v4().simple().to_string(),
            key: B64.encode(key.as_bytes()),
            device_name: device_name.to_string(),
            is_mobile,
            last_connect_date: 0,
        }
    }

    fn handle_auth(store: &mut SyncStore, password: &str, headers: &HashMap<String, String>) -> Result<String, String> {
        let msg = headers.get("m").ok_or(AUTH_FAILED)?;
        if let Some(client_id) = headers.get("i") {
            let info = store.devices.get(client_id).ok_or(AUTH_FAILED)?;
            let plain = aes_decrypt(msg, &info.key)?;
            if !plain.starts_with(AUTH_MSG) {
                return Err(AUTH_FAILED.into());
            }
            return Ok(aes_encrypt(HELLO_MSG, &info.key));
        }
        let pwd_key = password_aes_key(password);
        let plain = aes_decrypt(msg, &pwd_key)?;
        if !plain.starts_with(AUTH_MSG) {
            return Err(AUTH_FAILED.into());
        }
        let parts: Vec<&str> = plain.split('\n').collect();
        if parts.len() < 3 {
            return Err(AUTH_FAILED.into());
        }
        let pub_body = format!("-----BEGIN PUBLIC KEY-----\n{}\n-----END PUBLIC KEY-----", parts[1]);
        let device_name = parts[2];
        let is_mobile = parts.get(3).map(|s| *s == "lx_music_mobile").unwrap_or(false);
        let key_info = create_client_key(device_name, is_mobile);
        let user = "default".to_string();
        store.client_user.insert(key_info.client_id.clone(), user);
        let resp = json!({
            "clientId": key_info.client_id,
            "key": key_info.key,
            "serverName": "Reader Sync"
        });
        let _priv_pem = store.rsa_private.clone().ok_or(AUTH_FAILED)?;
        let enc = rsa_encrypt(&resp.to_string(), &pub_body)?;
        store.devices.insert(key_info.client_id.clone(), key_info);
        save_store(store);
        Ok(enc)
    }

    fn verify_ws_connect(store: &SyncStore, client_id: &str, token: &str) -> bool {
        let info = match store.devices.get(client_id) {
            Some(i) => i,
            None => return false,
        };
        aes_decrypt(token, &info.key).map(|t| t == CONNECT_MSG).unwrap_or(false)
    }

    struct WsSession {
        key: String,
        pending: HashMap<u64, tokio::sync::oneshot::Sender<Result<Value, String>>>,
    }

    async fn ws_call(session: &Arc<Mutex<WsSession>>, write: &Arc<AsyncMutex<futures_util::stream::SplitSink<tokio_tungstenite::WebSocketStream<TcpStream>, tokio_tungstenite::tungstenite::Message>>>, method: &str, params: Vec<Value>) -> Result<Value, String> {
        let id = MSG_ID.fetch_add(1, Ordering::SeqCst) + 1;
        let (tx, rx) = tokio::sync::oneshot::channel();
        let key = {
            let mut guard = session.lock().unwrap();
            guard.pending.insert(id, tx);
            guard.key.clone()
        };
        let payload = json!({ "id": id, "method": method, "params": params });
        let enc = encrypt_msg(&payload.to_string(), &key);
        {
            let mut w = write.lock().await;
            w.send(tokio_tungstenite::tungstenite::Message::Text(enc.into()))
                .await
                .map_err(|e| e.to_string())?;
        }
        match tokio::time::timeout(std::time::Duration::from_secs(120), rx).await {
            Ok(Ok(r)) => r,
            Ok(Err(_)) => Err("channel closed".into()),
            Err(_) => Err("rpc timeout".into()),
        }
    }

    async fn run_sync(
        session: Arc<Mutex<WsSession>>,
        write: Arc<AsyncMutex<futures_util::stream::SplitSink<tokio_tungstenite::WebSocketStream<TcpStream>, tokio_tungstenite::tungstenite::Message>>>,
        store: Arc<Mutex<SyncStore>>,
    ) {
        let features = ws_call(
            &session,
            &write,
            "getEnabledFeatures",
            vec![json!("server"), json!({ "list": 1, "dislike": 1 })],
        )
        .await
        .unwrap_or(json!({ "list": { "skipSnapshot": false }, "dislike": { "skipSnapshot": false } }));

        if features.get("list").is_some() {
            let remote_md5 = ws_call(&session, &write, "list.list_sync_get_md5", vec![])
                .await
                .ok()
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_default();
            let local_md5 = {
                let guard = store.lock().unwrap();
                md5_hex(&guard.list_data.to_string())
            };
            if remote_md5 != local_md5 {
                let mode = ws_call(&session, &write, "list.list_sync_get_sync_mode", vec![])
                    .await
                    .ok()
                    .and_then(|v| v.as_str().map(String::from))
                    .unwrap_or_else(|| "merge_local_remote".into());
                if mode != "cancel" {
                    let remote_data = ws_call(&session, &write, "list.list_sync_get_list_data", vec![])
                        .await
                        .unwrap_or(json!({}));
                    let local_data = {
                        let guard = store.lock().unwrap();
                        guard.list_data.clone()
                    };
                    let merged = match mode.as_str() {
                        "overwrite_local_remote" | "overwrite_local_remote_full" => local_data,
                        "overwrite_remote_local" | "overwrite_remote_local_full" => remote_data,
                        _ => {
                            let mut m = local_data.clone();
                            if let Some(rd) = remote_data.get("defaultList").and_then(|v| v.as_array()) {
                                if let Some(ld) = m.get_mut("defaultList") {
                                    *ld = Value::Array(rd.clone());
                                }
                            }
                            m
                        }
                    };
                    let _ = ws_call(&session, &write, "list.list_sync_set_list_data", vec![merged.clone()]).await;
                    {
                        let mut guard = store.lock().unwrap();
                        guard.list_data = merged;
                        save_store(&guard);
                    }
                }
            }
            let _ = ws_call(&session, &write, "list.list_sync_finished", vec![]).await;
        }

        if features.get("dislike").is_some() {
            let remote_md5 = ws_call(&session, &write, "dislike.dislike_sync_get_md5", vec![])
                .await
                .ok()
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_default();
            let local_md5 = {
                let guard = store.lock().unwrap();
                md5_hex(&guard.dislike_data)
            };
            if remote_md5 != local_md5 {
                let remote = ws_call(&session, &write, "dislike.dislike_sync_get_list_data", vec![])
                    .await
                    .ok()
                    .and_then(|v| v.as_str().map(String::from))
                    .unwrap_or_default();
                let _ = ws_call(&session, &write, "dislike.dislike_sync_set_list_data", vec![json!(remote)]).await;
                let mut guard = store.lock().unwrap();
                guard.dislike_data = remote;
                save_store(&guard);
            }
            let _ = ws_call(&session, &write, "dislike.dislike_sync_finished", vec![]).await;
        }

        let _ = ws_call(&session, &write, "finished", vec![]).await;
    }

    async fn serve_ws(stream: TcpStream, store: Arc<Mutex<SyncStore>>, client_id: String) {
        let key = {
            let guard = store.lock().unwrap();
            guard.devices.get(&client_id).map(|d| d.key.clone()).unwrap_or_default()
        };
        if key.is_empty() {
            return;
        }

        let store2 = store.clone();
        let client_id2 = client_id.clone();
        let ws_stream = match accept_hdr_async(stream, |req: &Request, mut resp: Response| {
            let query = req.uri().query().unwrap_or("");
            let mut i = String::new();
            let mut t = String::new();
            for part in query.split('&') {
                let mut kv = part.splitn(2, '=');
                match (kv.next(), kv.next()) {
                    (Some("i"), Some(v)) => i = urlencoding::decode(v).unwrap_or_default().into_owned(),
                    (Some("t"), Some(v)) => t = urlencoding::decode(v).unwrap_or_default().into_owned(),
                    _ => {}
                }
            }
            let ok = {
                let guard = store2.lock().unwrap();
                verify_ws_connect(&guard, &i, &t) && i == client_id2
            };
            if !ok {
                *resp.status_mut() = http::StatusCode::UNAUTHORIZED;
            }
            Ok(resp)
        })
        .await
        {
            Ok(s) => s,
            Err(e) => {
                log::warn!("ws accept: {e}");
                return;
            }
        };

        let session = Arc::new(Mutex::new(WsSession {
            key: key.clone(),
            pending: HashMap::new(),
        }));
        let (write, mut read) = ws_stream.split();
        let write = Arc::new(AsyncMutex::new(write));

        {
            let mut guard = store.lock().unwrap();
            if let Some(dev) = guard.devices.get_mut(&client_id) {
                dev.last_connect_date = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                save_store(&guard);
            }
        }

        let session_sync = session.clone();
        let write_sync = write.clone();
        let store_sync = store.clone();
        tokio::spawn(async move {
            run_sync(session_sync, write_sync, store_sync).await;
        });

        while let Some(msg) = read.next().await {
            let msg = match msg {
                Ok(m) => m,
                Err(_) => break,
            };
            let text = match msg.into_text() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if text.as_str() == "ping" {
                continue;
            }
            let plain = match decrypt_msg(&text, &key) {
                Ok(p) => p,
                Err(e) => {
                    log::warn!("decrypt: {e}");
                    continue;
                }
            };
            let data: Value = match serde_json::from_str(&plain) {
                Ok(v) => v,
                Err(_) => continue,
            };

            if let Some(id) = data.get("id").and_then(|v| v.as_u64()) {
                if data.get("result").is_some() || data.get("error").is_some() {
                    let mut guard = session.lock().unwrap();
                    if let Some(tx) = guard.pending.remove(&id) {
                        let result = if let Some(err) = data.get("error") {
                            Err(err.as_str().unwrap_or("error").to_string())
                        } else {
                            Ok(data.get("result").cloned().unwrap_or(Value::Null))
                        };
                        let _ = tx.send(result);
                    }
                    continue;
                }
            }

            let method = data.get("method").and_then(|v| v.as_str()).unwrap_or("");
            let id = data.get("id").and_then(|v| v.as_u64());
            let params = data.get("params").and_then(|v| v.as_array()).cloned().unwrap_or_default();

            let result: Result<Value, String> = match method {
                "getEnabledFeatures" => Ok(json!({ "list": { "skipSnapshot": false }, "dislike": { "skipSnapshot": false } })),
                "finished" => Ok(Value::Null),
                "list.list_sync_get_md5" => {
                    let guard = store.lock().unwrap();
                    Ok(json!(md5_hex(&guard.list_data.to_string())))
                }
                "list.list_sync_get_list_data" => {
                    let guard = store.lock().unwrap();
                    Ok(guard.list_data.clone())
                }
                "list.list_sync_set_list_data" => {
                    if let Some(d) = params.first() {
                        let mut guard = store.lock().unwrap();
                        guard.list_data = d.clone();
                        save_store(&guard);
                    }
                    Ok(Value::Null)
                }
                "list.list_sync_get_sync_mode" => Ok(json!("merge_local_remote")),
                "list.list_sync_finished" => Ok(Value::Null),
                "dislike.dislike_sync_get_md5" => {
                    let guard = store.lock().unwrap();
                    Ok(json!(md5_hex(&guard.dislike_data)))
                }
                "dislike.dislike_sync_get_list_data" => {
                    let guard = store.lock().unwrap();
                    Ok(json!(guard.dislike_data))
                }
                "dislike.dislike_sync_set_list_data" => {
                    if let Some(d) = params.first().and_then(|v| v.as_str()) {
                        let mut guard = store.lock().unwrap();
                        guard.dislike_data = d.to_string();
                        save_store(&guard);
                    }
                    Ok(Value::Null)
                }
                "dislike.dislike_sync_get_sync_mode" => Ok(json!("merge_local_remote")),
                "dislike.dislike_sync_finished" => Ok(Value::Null),
                _ => Ok(Value::Null),
            };

            if let Some(id) = id {
                let resp = match result {
                    Ok(r) => json!({ "id": id, "result": r }),
                    Err(e) => json!({ "id": id, "error": e }),
                };
                let out = serde_json::to_string(&resp).unwrap_or_default();
                let encrypted = encrypt_msg(&out, &key);
                let mut w = write.lock().await;
                if w
                    .send(tokio_tungstenite::tungstenite::Message::Text(encrypted.into()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
        }
    }

    fn parse_headers(req: &str) -> (String, String, HashMap<String, String>) {
        let first = req.lines().next().unwrap_or("");
        let parts: Vec<&str> = first.split_whitespace().collect();
        let method = parts.first().copied().unwrap_or("GET").to_string();
        let path = parts.get(1).copied().unwrap_or("/").to_string();
        let mut headers = HashMap::new();
        for line in req.lines().skip(1) {
            if line.is_empty() {
                break;
            }
            if let Some((k, v)) = line.split_once(':') {
                headers.insert(k.trim().to_lowercase(), v.trim().to_string());
            }
        }
        (method, path, headers)
    }

    async fn handle_connection(
        mut stream: TcpStream,
        store: Arc<Mutex<SyncStore>>,
        password: String,
    ) {
        let mut buf = vec![0u8; 8192];
        let n = match stream.read(&mut buf).await {
            Ok(n) => n,
            Err(_) => return,
        };
        let req = String::from_utf8_lossy(&buf[..n]);
        let (method, path, headers) = parse_headers(&req);

        if req.contains("Upgrade: websocket") || req.contains("upgrade: websocket") {
            let query = path.split('?').nth(1).unwrap_or("");
            let mut client_id = String::new();
            for part in query.split('&') {
                if let Some(v) = part.strip_prefix("i=") {
                    client_id = urlencoding::decode(v).unwrap_or_default().into_owned();
                }
            }
            if !client_id.is_empty() {
                serve_ws(stream, store, client_id).await;
            }
            return;
        }

        let end = path.rsplit('/').next().unwrap_or("");
        let (status, body) = match end {
            "hello" => (200, HELLO_MSG.to_string()),
            "id" => {
                let sid = store.lock().unwrap().server_id.clone();
                (200, format!("{ID_PREFIX}{sid}"))
            }
            "ah" => {
                let mut guard = store.lock().unwrap();
                match handle_auth(&mut guard, &password, &headers) {
                    Ok(msg) => (200, msg),
                    Err(msg) => (401, msg),
                }
            }
            _ => (401, "Forbidden".to_string()),
        };

        let resp = format!(
            "HTTP/1.1 {status} OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let _ = stream.write_all(resp.as_bytes()).await;
        let _ = method;
    }

    async fn serve_http(port: u16, password: String, store: Arc<Mutex<SyncStore>>) {
        let addr = format!("0.0.0.0:{port}");
        let listener = match TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                log::error!("sync bind {addr}: {e}");
                return;
            }
        };
        log::info!("lx sync server v4 listening on {addr}");
        while RUNNING.load(Ordering::SeqCst) {
            let accept = tokio::select! {
                res = listener.accept() => res,
                _ = tokio::time::sleep(std::time::Duration::from_millis(250)) => {
                    continue;
                }
            };
            let (stream, _) = match accept {
                Ok(v) => v,
                Err(_) => continue,
            };
            let password2 = password.clone();
            let store2 = store.clone();
            tokio::spawn(async move {
                handle_connection(stream, store2, password2).await;
            });
        }
    }

    pub fn start(port: u16, password: Option<String>, data_dir: PathBuf) -> Result<(), String> {
        stop();
        let _ = DATA_DIR.set(data_dir);
        RUNNING.store(true, Ordering::SeqCst);
        let pwd = password.unwrap_or_default();
        if pwd.is_empty() {
            return Err("Sync Server 需要设置连接密码".into());
        }
        let store = load_store(&pwd);
        save_store(&store);
        let store = Arc::new(Mutex::new(store));
        let handle = thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("tokio runtime");
            rt.block_on(serve_http(port, pwd, store));
        });
        HANDLE
            .get_or_init(|| Mutex::new(None))
            .lock()
            .unwrap()
            .replace(handle);
        Ok(())
    }

    pub fn stop() {
        RUNNING.store(false, Ordering::SeqCst);
        if let Some(lock) = HANDLE.get() {
            if let Some(h) = lock.lock().unwrap().take() {
                let _ = h.join();
            }
        }
    }

    pub fn get_status() -> Value {
        let dir = store_path();
        let path = dir.join("store.json");
        if !path.exists() {
            return json!({ "running": RUNNING.load(Ordering::SeqCst), "devices": [] });
        }
        let store: SyncStore = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        let devices: Vec<Value> = store
            .devices
            .values()
            .map(|d| {
                json!({
                    "clientId": d.client_id,
                    "deviceName": d.device_name,
                    "isMobile": d.is_mobile,
                    "lastConnectDate": d.last_connect_date,
                })
            })
            .collect();
        json!({
            "running": RUNNING.load(Ordering::SeqCst),
            "serverId": store.server_id,
            "devices": devices,
        })
    }
}

#[tauri::command]
pub fn start_lx_sync_server(
    app: tauri::AppHandle,
    port: u16,
    password: Option<String>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri::Manager;
        let data_dir = crate::effective_data_dir_at_startup()
            .or_else(|_| app.path().app_data_dir().map_err(|e| e.to_string()))?;
        return imp::start(port, password, data_dir);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, port, password);
        Err("Sync Server 仅桌面端可用".into())
    }
}

#[tauri::command]
pub fn stop_lx_sync_server() {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    imp::stop();
}

#[tauri::command]
pub fn get_lx_sync_server_status() -> serde_json::Value {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::get_status();
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        serde_json::json!({ "running": false, "devices": [] })
    }
}
