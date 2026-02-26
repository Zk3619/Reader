//! 书源登录脚本引擎（Rust 侧）：Boa 纯 Rust 执行 Legado 脚本，java.ajax 真阻塞，支持 Windows/Android/iOS。

use chrono::{TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

/// 前端传入的入参（与 JS 层 runLoginScript 对齐）
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunLoginScriptInput {
    pub base_url: String,
    pub login_url_script: String,
    #[serde(default)]
    pub js_lib: String,
    #[serde(default)]
    pub header: String,
    pub form_values: HashMap<String, String>,
    pub action: String,
    #[serde(default)]
    pub args_json: String,
    #[serde(default)]
    pub login_info_json: String,
    /// 上次运行后的 cookie 表（JSON 对象：url -> cookie 串），本次运行开始时注入，便于「检测登录」等后续请求带 cookie
    #[serde(default)]
    pub cookies_json: String,
    #[serde(default)]
    pub android_id: Option<String>,
}

/// 单条 toast
#[derive(Debug, Clone, Serialize)]
pub struct ToastItem {
    pub message: String,
    pub long: bool,
}

/// 待打开 URL 及其对应 cookie（供新 webview 携带登录态）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlWithCookies {
    pub url: String,
    pub cookies: String,
}

/// 执行结果
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RunLoginScriptOutput {
    pub toasts: Vec<ToastItem>,
    pub args_json: String,
    pub login_info_json: String,
    pub urls_to_open: Vec<String>,
    /// 与 urls_to_open 一一对应，每个 URL 的 cookie 串（新窗口打开时注入，避免“未登录”）
    pub url_cookies: Vec<UrlWithCookies>,
    /// 本次运行结束时的 cookie 表（JSON 对象），前端持久化后下次运行传入 cookies_json，便于检测登录/用户后台等带 cookie
    pub cookies_json: String,
    pub error: Option<String>,
}

pub fn is_absolute_url(s: &str) -> bool {
    let s = s.trim();
    s.starts_with("http://") || s.starts_with("https://")
}

/// 从 URL 解析出 origin（scheme + host + port），用于在 cookies 表中查找对应域的 cookie
fn origin_of(url_str: &str) -> Option<String> {
    let s = url_str.trim();
    if s.is_empty() {
        return None;
    }
    let parsed = url::Url::parse(s).ok()?;
    let origin = parsed.origin();
    let serialized = origin.ascii_serialization();
    if serialized.is_empty() {
        return None;
    }
    Some(serialized)
}

/// 根据待打开 URL 在 cookies 表中查找最匹配的 cookie 串（key 为 base URL / origin）
fn cookie_for_url(cookies: &HashMap<String, String>, url_to_open: &str) -> String {
    let url_trim = url_to_open.trim();
    if url_trim.is_empty() {
        return String::new();
    }
    if let Some(origin) = origin_of(url_trim) {
        if let Some(c) = cookies.get(&origin) {
            return c.clone();
        }
        let without_port = origin.trim_end_matches(":443").trim_end_matches(":80");
        if let Some(c) = cookies.get(without_port) {
            return c.clone();
        }
    }
    let mut best: Option<(usize, &str)> = None;
    for key in cookies.keys() {
        let k = key.trim_end_matches('/');
        if url_trim.starts_with(k)
            && (k.is_empty()
                || url_trim
                    .as_bytes()
                    .get(k.len())
                    .map_or(true, |&c| c == b'/' || c == b'?'))
        {
            if best.map_or(true, |(len, _)| k.len() > len) {
                best = Some((k.len(), key));
            }
        }
    }
    best.and_then(|(_, key)| cookies.get(key).cloned())
        .unwrap_or_default()
}

pub fn resolve_url(base: &str, relative: &str) -> String {
    let relative = relative.trim();
    if is_absolute_url(relative) {
        return relative.to_string();
    }
    if let Ok(base_url) = url::Url::parse(base) {
        if let Ok(u) = base_url.join(relative) {
            return u.to_string();
        }
    }
    if relative.starts_with('/') {
        if let Ok(b) = url::Url::parse(base) {
            return format!("{}//{}{}", b.scheme(), b.host_str().unwrap_or(""), relative);
        }
    }
    let base_path = base.trim_end_matches('/');
    format!("{}/{}", base_path, relative)
}

pub fn merge_headers(
    source_header: &str,
    script_headers: Option<&HashMap<String, String>>,
) -> HashMap<String, String> {
    let mut out: HashMap<String, String> = HashMap::new();
    if let Some(h) = script_headers {
        out.extend(h.clone());
    }
    if !source_header.trim().is_empty() {
        if let Ok(parsed) = serde_json::from_str::<HashMap<String, String>>(source_header) {
            for (k, v) in parsed {
                if !v.trim().is_empty() {
                    out.insert(k, v);
                }
            }
        }
    }
    out
}

pub fn blocking_http(
    url: &str,
    method: &str,
    headers: &HashMap<String, String>,
    body: Option<&str>,
) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(12))
        .connect_timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(10))
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let req_method = match method.to_uppercase().as_str() {
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "HEAD" => reqwest::Method::HEAD,
        _ => reqwest::Method::GET,
    };

    let mut request = client.request(req_method, url);
    for (k, v) in headers {
        request = request.header(k.as_str(), v.as_str());
    }
    if let Some(b) = body {
        request = request.body(b.to_string());
    }

    let response = request.send().map_err(|e| e.to_string())?;
    let status = response.status();
    let bytes = response.bytes().map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    if !status.is_success() {
        return Err(format!(
            "{}: {}",
            status,
            text.chars().take(200).collect::<String>()
        ));
    }
    Ok(text)
}

fn parse_ajax_arg(arg: &str) -> (String, String, Option<String>, HashMap<String, String>) {
    let mut method = "GET".to_string();
    let mut body = None::<String>;
    let mut script_headers = HashMap::new();
    let url_str = if let Some(comma) = arg.find(',') {
        let u = arg[..comma].trim().to_string();
        let after = arg[comma + 1..].trim();
        if after.starts_with('{') {
            if let Ok(opts) = serde_json::from_str::<HashMap<String, serde_json::Value>>(after) {
                if let Some(m) = opts.get("method").and_then(|v| v.as_str()) {
                    method = m.to_uppercase();
                }
                if let Some(b) = opts.get("body") {
                    body = Some(if b.is_string() {
                        b.as_str().unwrap_or("").to_string()
                    } else {
                        serde_json::to_string(b).unwrap_or_default()
                    });
                }
                if let Some(h) = opts.get("headers").and_then(|v| v.as_object()) {
                    for (k, v) in h {
                        if let Some(s) = v.as_str() {
                            script_headers.insert(k.clone(), s.to_string());
                        }
                    }
                }
            }
        }
        u
    } else {
        arg.trim().to_string()
    };
    (url_str, method, body, script_headers)
}

struct ScriptState {
    toasts: Vec<(String, bool)>,
    args_json: String,
    login_info_json: String,
    cookies: HashMap<String, String>,
    urls_to_open: Vec<String>,
    base_url: String,
    source_header: String,
    android_id: String,
}

// Boa 的 NativeFunction 需为 fn 指针，通过 thread_local 传递 state
thread_local! {
    static BOA_SCRIPT_STATE: RefCell<Option<Rc<RefCell<ScriptState>>>> = RefCell::new(None);
}

fn with_state<F, R>(f: F) -> R
where
    F: FnOnce(&Rc<RefCell<ScriptState>>) -> R,
{
    BOA_SCRIPT_STATE.with(|cell| {
        let borrow = cell.borrow();
        let state = borrow.as_ref().expect("BOA_SCRIPT_STATE not set");
        f(state)
    })
}

// 无捕获的 native 函数，供 from_fn_ptr 使用，通过 with_state 取数据
fn native_android_id(
    _this: &boa_engine::JsValue,
    _args: &[boa_engine::JsValue],
    _context: &mut boa_engine::Context,
) -> boa_engine::JsResult<boa_engine::JsValue> {
    use boa_engine::{JsString, JsValue};
    let aid = with_state(|s| s.borrow().android_id.clone());
    Ok(JsValue::from(JsString::from(aid)))
}

fn native_start_browser(
    _this: &boa_engine::JsValue,
    args: &[boa_engine::JsValue],
    ctx: &mut boa_engine::Context,
) -> boa_engine::JsResult<boa_engine::JsValue> {
    use boa_engine::JsValue;
    let url = args
        .get(0)
        .and_then(|v| v.to_string(ctx).ok())
        .map(|s| s.to_std_string_escaped())
        .unwrap_or_default();
    let base = with_state(|s| s.borrow().base_url.clone());
    let u = url.trim();
    let comma = u.find(',').unwrap_or(u.len());
    let u = u[..comma].trim();
    let resolved =
        if u.starts_with("http://") || u.starts_with("https://") || u.starts_with("data:") {
            u.to_string()
        } else {
            resolve_url(&base, u)
        };
    with_state(|s| s.borrow_mut().urls_to_open.push(resolved));
    Ok(JsValue::undefined())
}

fn native_start_browser_await(
    _this: &boa_engine::JsValue,
    args: &[boa_engine::JsValue],
    ctx: &mut boa_engine::Context,
) -> boa_engine::JsResult<boa_engine::JsValue> {
    use boa_engine::JsValue;
    let url = args
        .get(0)
        .and_then(|v| v.to_string(ctx).ok())
        .map(|s| s.to_std_string_escaped())
        .unwrap_or_default();
    let base = with_state(|s| s.borrow().base_url.clone());
    let u = url.trim();
    let comma = u.find(',').unwrap_or(u.len());
    let u = u[..comma].trim();
    let resolved =
        if u.starts_with("http://") || u.starts_with("https://") || u.starts_with("data:") {
            u.to_string()
        } else {
            resolve_url(&base, u)
        };
    with_state(|s| s.borrow_mut().urls_to_open.push(resolved));
    Ok(JsValue::undefined())
}

fn native_ajax(
    _this: &boa_engine::JsValue,
    args: &[boa_engine::JsValue],
    ctx: &mut boa_engine::Context,
) -> boa_engine::JsResult<boa_engine::JsValue> {
    use boa_engine::{JsString, JsValue};
    let url_arg = args
        .get(0)
        .and_then(|v| v.to_string(ctx).ok())
        .map(|s| s.to_std_string_escaped())
        .unwrap_or_default();
    let (url_str, method, body, script_headers) = parse_ajax_arg(&url_arg);
    let result = if url_str.is_empty() || url_str.contains("[object Object]") {
        String::new()
    } else {
        let (base_ajax, header_ajax) = with_state(|s| {
            let st = s.borrow();
            (st.base_url.clone(), st.source_header.clone())
        });
        let resolved = resolve_url(&base_ajax, &url_str);
        let headers = merge_headers(&header_ajax, Some(&script_headers));
        let body_ref = body.as_deref();
        match blocking_http(&resolved, &method, &headers, body_ref) {
            Ok(text) => text,
            Err(e) => e.to_string(),
        }
    };
    Ok(JsValue::from(JsString::from(result)))
}

pub fn run_login_script_rust(input: RunLoginScriptInput) -> Result<RunLoginScriptOutput, String> {
    use boa_engine::{
        js_string,
        object::{builtins::JsArray, FunctionObjectBuilder, JsObject},
        property::{Attribute, PropertyDescriptor},
        Context, JsString, JsValue, NativeFunction, Source,
    };

    fn to_js_fn(f: NativeFunction, context: &mut boa_engine::Context) -> boa_engine::JsValue {
        JsValue::from(
            FunctionObjectBuilder::new(context.realm(), f)
                .constructor(false)
                .build(),
        )
    }

    let android_id = input
        .android_id
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("rust_{}", uuid::Uuid::new_v4().simple()));

    let cookies: HashMap<String, String> =
        serde_json::from_str(&input.cookies_json).unwrap_or_else(|_| HashMap::new());

    let state = Rc::new(RefCell::new(ScriptState {
        toasts: Vec::new(),
        args_json: input.args_json.clone(),
        login_info_json: input.login_info_json.clone(),
        cookies,
        urls_to_open: Vec::new(),
        base_url: input.base_url.clone(),
        source_header: input.header.clone(),
        android_id: android_id.clone(),
    }));

    let action_with_pre_debug = format!(
        "if(typeof __loginScriptRustDebug==='function')__loginScriptRustDebug('pre');\n{}",
        input.action.trim()
    );
    let full_script = format!(
        "{}\n{}\n; {}",
        if input.js_lib.trim().is_empty() {
            ""
        } else {
            input.js_lib.trim()
        },
        input.login_url_script.trim(),
        action_with_pre_debug
    );
    // 将 source.xxx 替换为 __host_source__.xxx，避免脚本内 var source = ... 遮蔽全局
    let mut full_script = full_script
        .replace("source.", "__host_source__.")
        .replace("source .", "__host_source__ .");
    // 将对 __host_source__.putLoginInfo(...) 的调用改为 __host_putLoginInfo(...)，避免从对象属性取值时在 Boa 内不可调用
    full_script = full_script.replace("__host_source__.putLoginInfo(", "__host_putLoginInfo(");
    full_script = full_script.replace("__host_source__ .putLoginInfo(", "__host_putLoginInfo(");
    full_script = full_script.replace("return source.putLoginInfo", "return __host_putLoginInfo");

    BOA_SCRIPT_STATE.with(|cell| {
        *cell.borrow_mut() = Some(state.clone());
    });

    let result: Result<(), String> = (|| {
        let mut context = Context::default();
        let globals = context.global_object().clone();

        let result_obj = JsObject::default(context.intrinsics());
        for (k, v) in &input.form_values {
            let key = JsString::from(k.as_str());
            let v_js = JsValue::from(JsString::from(v.as_str()));
            result_obj
                .set(key, v_js, true, &mut context)
                .map_err(|e| format!("set result.{}: {}", k, e))?;
        }
        globals
            .set(
                js_string!("result"),
                JsValue::from(result_obj),
                true,
                &mut context,
            )
            .map_err(|e| format!("set result: {}", e))?;

        let base_url_val = JsValue::from(JsString::from(input.base_url.as_str()));
        globals
            .set(js_string!("baseUrl"), base_url_val, true, &mut context)
            .map_err(|e| format!("set baseUrl: {}", e))?;

        let host_arr = JsArray::from_iter(
            [JsValue::from(JsString::from(input.base_url.as_str()))],
            &mut context,
        );
        globals
            .set(
                js_string!("host"),
                JsValue::from(host_arr),
                true,
                &mut context,
            )
            .map_err(|e| format!("set host: {}", e))?;

        let source_obj = JsObject::default(context.intrinsics());
        let get_variable = NativeFunction::from_fn_ptr(|_this, _args, _context| {
            let s = with_state(|st| st.borrow().args_json.clone());
            Ok(JsValue::from(JsString::from(s)))
        });
        source_obj
            .set(
                js_string!("getVariable"),
                to_js_fn(get_variable, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| format!("set getVariable: {}", e))?;
        let set_variable = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let val = args
                .get(0)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            with_state(|s| s.borrow_mut().args_json = val);
            Ok(JsValue::undefined())
        });
        source_obj
            .set(
                js_string!("setVariable"),
                to_js_fn(set_variable, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| format!("set setVariable: {}", e))?;
        let get_login_info = NativeFunction::from_fn_ptr(|_this, _args, _context| {
            let s = with_state(|st| st.borrow().login_info_json.clone());
            Ok(JsValue::from(JsString::from(s)))
        });
        source_obj
            .set(
                js_string!("getLoginInfo"),
                to_js_fn(get_login_info, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| format!("set getLoginInfo: {}", e))?;
        let get_key = NativeFunction::from_fn_ptr(|_this, _args, _context| {
            let (header, base_url) = with_state(|st| {
                let st = st.borrow();
                (st.source_header.clone(), st.base_url.clone())
            });
            let key = serde_json::from_str::<HashMap<String, String>>(&header)
                .ok()
                .and_then(|m| m.get("key").cloned())
                .unwrap_or(base_url);
            Ok(JsValue::from(JsString::from(key)))
        });
        source_obj
            .set(
                js_string!("getKey"),
                to_js_fn(get_key, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| format!("set source.getKey: {}", e))?;

        let put_login_info_native = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            eprintln!("[login_script_rust] >>> source.putLoginInfo 被调用（原生）");
            let val = args
                .get(0)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            with_state(|s| s.borrow_mut().login_info_json = val);
            Ok(JsValue::undefined())
        });
        // 与 getArgument/setArgument 一致：用 FunctionObjectBuilder + name/length，确保作为参数传入时 Boa 仍视为可调用
        let put_login_info_fn = FunctionObjectBuilder::new(context.realm(), put_login_info_native)
            .name(js_string!("putLoginInfo"))
            .length(1)
            .constructor(false)
            .build();
        source_obj
            .set(
                js_string!("putLoginInfo"),
                put_login_info_fn.clone(),
                true,
                &mut context,
            )
            .map_err(|e| format!("source.putLoginInfo: {}", e))?;

        let get_argument = NativeFunction::from_fn_ptr(|_this, args, context| {
            let key = args
                .get(0)
                .and_then(|v| v.to_string(context).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let out = with_state(|s| {
                let args_map: HashMap<String, String> =
                    serde_json::from_str(&s.borrow().args_json).unwrap_or_default();
                args_map.get(&key).cloned().unwrap_or_default()
            });
            Ok(JsValue::from(JsString::from(out)))
        });
        source_obj
            .set(
                js_string!("getArgument"),
                to_js_fn(get_argument, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| format!("set source.getArgument: {}", e))?;
        let set_argument = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let key = args
                .get(0)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let value = args
                .get(1)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            with_state(|s| {
                let mut st = s.borrow_mut();
                let mut args_map: HashMap<String, String> =
                    serde_json::from_str(&st.args_json).unwrap_or_default();
                args_map.insert(key, value);
                st.args_json =
                    serde_json::to_string(&args_map).unwrap_or_else(|_| "{}".to_string());
            });
            Ok(JsValue::undefined())
        });
        source_obj
            .set(
                js_string!("setArgument"),
                to_js_fn(set_argument, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| format!("set source.setArgument: {}", e))?;

        let get_argument_global = NativeFunction::from_fn_ptr(|_this, args, context| {
            let key = args
                .get(0)
                .and_then(|v| v.to_string(context).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let out = with_state(|s| {
                let args_map: HashMap<String, String> =
                    serde_json::from_str(&s.borrow().args_json).unwrap_or_default();
                args_map.get(&key).cloned().unwrap_or_default()
            });
            Ok(JsValue::from(JsString::from(out)))
        });
        let get_argument_fn = FunctionObjectBuilder::new(context.realm(), get_argument_global)
            .name(js_string!("getArgument"))
            .length(1)
            .constructor(false)
            .build();
        let set_argument_global = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let key = args
                .get(0)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let value = args
                .get(1)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            with_state(|s| {
                let mut st = s.borrow_mut();
                let mut args_map: HashMap<String, String> =
                    serde_json::from_str(&st.args_json).unwrap_or_default();
                args_map.insert(key, value);
                st.args_json =
                    serde_json::to_string(&args_map).unwrap_or_else(|_| "{}".to_string());
            });
            Ok(JsValue::undefined())
        });
        let set_argument_fn = FunctionObjectBuilder::new(context.realm(), set_argument_global)
            .name(js_string!("setArgument"))
            .length(2)
            .constructor(false)
            .build();

        context
            .register_global_property(
                js_string!("source"),
                JsValue::from(source_obj),
                Attribute::empty(), // 不可写、不可配置，防止脚本覆盖 source
            )
            .map_err(|e| format!("register source: {}", e))?;
        globals
            .set(
                js_string!("putLoginInfo"),
                put_login_info_fn,
                true,
                &mut context,
            )
            .map_err(|e| format!("putLoginInfo: {}", e))?;
        globals
            .define_property_or_throw(
                js_string!("getArgument"),
                PropertyDescriptor::builder()
                    .value(get_argument_fn)
                    .writable(true)
                    .enumerable(false)
                    .configurable(true),
                &mut context,
            )
            .map_err(|e| format!("getArgument: {}", e))?;
        globals
            .define_property_or_throw(
                js_string!("setArgument"),
                PropertyDescriptor::builder()
                    .value(set_argument_fn)
                    .writable(true)
                    .enumerable(false)
                    .configurable(true),
                &mut context,
            )
            .map_err(|e| format!("setArgument: {}", e))?;

        let cookie_obj = JsObject::default(context.intrinsics());
        let get_cookie = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let url = args
                .get(0)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let out = with_state(|s| s.borrow().cookies.get(&url).cloned().unwrap_or_default());
            Ok(JsValue::from(JsString::from(out)))
        });
        cookie_obj
            .set(
                js_string!("getCookie"),
                to_js_fn(get_cookie, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| e.to_string())?;
        let set_cookie = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let url = args
                .get(0)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let value = args
                .get(1)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            with_state(|s| s.borrow_mut().cookies.insert(url, value));
            Ok(JsValue::undefined())
        });
        cookie_obj
            .set(
                js_string!("setCookie"),
                to_js_fn(set_cookie, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| e.to_string())?;
        let remove_cookie = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let url = args
                .get(0)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            with_state(|s| s.borrow_mut().cookies.remove(&url));
            Ok(JsValue::undefined())
        });
        cookie_obj
            .set(
                js_string!("removeCookie"),
                to_js_fn(remove_cookie, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| e.to_string())?;
        globals
            .set(
                js_string!("cookie"),
                JsValue::from(cookie_obj),
                true,
                &mut context,
            )
            .map_err(|e| format!("set cookie: {}", e))?;

        let java_obj = JsObject::default(context.intrinsics());
        let toast_fn = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let msg = args
                .get(0)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            if !msg.is_empty() {
                with_state(|s| s.borrow_mut().toasts.push((msg, false)));
            }
            Ok(JsValue::undefined())
        });
        java_obj
            .set(
                js_string!("toast"),
                to_js_fn(toast_fn, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| e.to_string())?;
        let long_toast_fn = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let msg = args
                .get(0)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            if !msg.is_empty() {
                with_state(|s| s.borrow_mut().toasts.push((msg, true)));
            }
            Ok(JsValue::undefined())
        });
        java_obj
            .set(
                js_string!("longToast"),
                to_js_fn(long_toast_fn, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| e.to_string())?;
        let java_log_fn = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let msg = args
                .get(0)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            eprintln!("[login_script_rust] java.log: {}", msg);
            Ok(JsValue::undefined())
        });
        java_obj
            .set(
                js_string!("log"),
                to_js_fn(java_log_fn, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| e.to_string())?;
        java_obj
            .set(
                js_string!("androidId"),
                to_js_fn(NativeFunction::from_fn_ptr(native_android_id), &mut context),
                true,
                &mut context,
            )
            .map_err(|e| e.to_string())?;
        let time_format_fn = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let ms = args
                .get(0)
                .and_then(|v| {
                    v.to_number(ctx).ok().map(|n| n as i64).or_else(|| {
                        v.to_string(ctx)
                            .ok()
                            .and_then(|s| s.to_std_string_escaped().parse::<i64>().ok())
                    })
                })
                .unwrap_or(0);
            let secs = ms / 1000;
            let s = match Utc.timestamp_opt(secs, 0).single() {
                Some(dt) => dt.format("%Y-%m-%d %H:%M:%S").to_string(),
                None => String::new(),
            };
            Ok(JsValue::from(JsString::from(s)))
        });
        java_obj
            .set(
                js_string!("timeFormat"),
                to_js_fn(time_format_fn, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| e.to_string())?;
        java_obj
            .set(
                js_string!("startBrowser"),
                to_js_fn(
                    NativeFunction::from_fn_ptr(native_start_browser),
                    &mut context,
                ),
                true,
                &mut context,
            )
            .map_err(|e| e.to_string())?;
        java_obj
            .set(
                js_string!("startBrowserAwait"),
                to_js_fn(
                    NativeFunction::from_fn_ptr(native_start_browser_await),
                    &mut context,
                ),
                true,
                &mut context,
            )
            .map_err(|e| e.to_string())?;

        let base64_encode_fn = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let s = args
                .get(0)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let encoded =
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, s.as_bytes());
            Ok(JsValue::from(JsString::from(encoded)))
        });
        java_obj
            .set(
                js_string!("base64Encode"),
                to_js_fn(base64_encode_fn, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| e.to_string())?;
        let base64_decode_fn = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let s = args
                .get(0)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let decoded =
                base64::Engine::decode(&base64::engine::general_purpose::STANDARD, s.as_bytes())
                    .unwrap_or_default();
            Ok(JsValue::from(JsString::from(
                String::from_utf8_lossy(&decoded).into_owned(),
            )))
        });
        java_obj
            .set(
                js_string!("base64Decode"),
                to_js_fn(base64_decode_fn, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| e.to_string())?;
        java_obj
            .set(
                js_string!("ajax"),
                to_js_fn(NativeFunction::from_fn_ptr(native_ajax), &mut context),
                true,
                &mut context,
            )
            .map_err(|e| e.to_string())?;

        globals
            .set(
                js_string!("java"),
                JsValue::from(java_obj),
                true,
                &mut context,
            )
            .map_err(|e| format!("set java: {}", e))?;

        let native_debug = NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let tag = args
                .get(0)
                .and_then(|v| v.to_string(ctx).ok())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_else(|| "?".to_string());
            let global = ctx.global_object();
            let mut msg = format!("[login_script_rust] __debug({}) ", tag);
            match global.get(js_string!("source"), ctx) {
                Ok(source_val) => {
                    let has_source = source_val.is_object();
                    msg.push_str(&format!("hasSource={} ", has_source));
                    if let Some(source_obj) = source_val.as_object() {
                        match source_obj.get(js_string!("putLoginInfo"), ctx) {
                            Ok(put_val) => {
                                let pt = if put_val.is_undefined() {
                                    "undefined"
                                } else if put_val.is_null() {
                                    "null"
                                } else if put_val.is_object() {
                                    "object"
                                } else if put_val.is_string() {
                                    "string"
                                } else {
                                    "other"
                                };
                                msg.push_str(&format!(
                                    "putLoginInfoType={} isCallable={}",
                                    pt,
                                    put_val.is_callable()
                                ));
                            }
                            Err(e) => {
                                msg.push_str(&format!("putLoginInfo_get_err={}", e));
                            }
                        }
                    } else {
                        msg.push_str("source_not_object");
                    }
                }
                Err(e) => {
                    msg.push_str(&format!("source_get_err={}", e));
                }
            }
            eprintln!("{}", msg);
            Ok(JsValue::undefined())
        });
        globals
            .set(
                js_string!("__loginScriptRustDebug"),
                to_js_fn(native_debug, &mut context),
                true,
                &mut context,
            )
            .map_err(|e| format!("set __loginScriptRustDebug: {}", e))?;

        // ----- 调试：执行前检查 source / source.putLoginInfo -----
        let debug_script = r#"
(function(){
  try {
    var hasSource = typeof source !== "undefined";
    var sourceType = typeof source;
    var putType = (hasSource && source != null) ? typeof source.putLoginInfo : "no-source";
    var isCallable = hasSource && source != null && source.putLoginInfo != null && (typeof source.putLoginInfo === "function");
    var hasGetLoginInfo = hasSource && source != null && (typeof source.getLoginInfo === "function");
    return JSON.stringify({
      hasSource: hasSource,
      sourceType: sourceType,
      putLoginInfoType: putType,
      isPutLoginInfoCallable: isCallable,
      isGetLoginInfoCallable: hasGetLoginInfo
    });
  } catch (e) {
    return "debug_err:" + (e && e.message ? e.message : String(e));
  }
})()
"#;
        let debug_info = context
            .eval(Source::from_bytes(debug_script.as_bytes()))
            .map(|v| {
                v.to_string(&mut context)
                    .map(|s| s.to_std_string_escaped())
                    .unwrap_or_else(|_| "?".to_string())
            })
            .unwrap_or_else(|e| format!("eval_failed: {}", e));
        eprintln!("[login_script_rust] 执行前 source 状态: {}", debug_info);

        // 将宿主 putLoginInfo 作为 IIFE 参数 __host_putLoginInfo 传入；与 getArgument 一致用 FunctionObjectBuilder 创建
        let wrapped_script = format!(
            r#"(function(__host_source__, result, baseUrl, host, getArgument, setArgument, __host_putLoginInfo, cookie, java) {{
try {{ if (typeof __loginScriptRustDebug === "function") __loginScriptRustDebug("IIFE-param: typeof __host_putLoginInfo=" + typeof __host_putLoginInfo + " callable=" + (typeof __host_putLoginInfo === "function")); }} catch(e) {{}}
{}
}})(source, result, baseUrl, host, getArgument, setArgument, putLoginInfo, cookie, java);"#,
            full_script
        );
        eprintln!(
            "[login_script_rust] 即将执行主脚本(IIFE 包装), 长度={} 字节",
            wrapped_script.len()
        );
        let eval_result = context.eval(Source::from_bytes(wrapped_script.as_bytes()));
        match &eval_result {
            Ok(_) => eprintln!("[login_script_rust] 主脚本执行完成"),
            Err(e) => {
                eprintln!(
                    "[login_script_rust] 主脚本执行失败: {} | 执行前状态: {}",
                    e, debug_info
                );
            }
        }
        eval_result.map_err(|e| {
            format!(
                "脚本执行错误: {} | [调试] 执行前 source 状态: {}",
                e, debug_info
            )
        })?;

        Ok(())
    })();

    BOA_SCRIPT_STATE.with(|cell| {
        *cell.borrow_mut() = None;
    });

    result?;

    let state = state.borrow();
    let url_cookies: Vec<UrlWithCookies> = state
        .urls_to_open
        .iter()
        .map(|u| UrlWithCookies {
            url: u.clone(),
            cookies: cookie_for_url(&state.cookies, u),
        })
        .collect();
    let cookies_json = serde_json::to_string(&state.cookies).unwrap_or_else(|_| "{}".to_string());
    Ok(RunLoginScriptOutput {
        toasts: state
            .toasts
            .iter()
            .map(|(m, long)| ToastItem {
                message: m.clone(),
                long: *long,
            })
            .collect(),
        args_json: state.args_json.clone(),
        login_info_json: state.login_info_json.clone(),
        urls_to_open: state.urls_to_open.clone(),
        url_cookies,
        cookies_json,
        error: None,
    })
}
