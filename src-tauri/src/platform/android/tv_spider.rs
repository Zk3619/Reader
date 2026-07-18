use serde::{Deserialize, Serialize};
use tauri::plugin::PluginHandle;
use tauri::{Manager, Runtime};

pub struct TvSpiderAndroid<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TvSpiderCallArgs {
    site_key: String,
    api: String,
    ext: String,
    jar_path: String,
    method: String,
    args_json: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TvJsonExtArgs {
    parse_type: i32,
    name: String,
    url: String,
    flag: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TvProxyArgs {
    params_json: String,
}

#[derive(Deserialize)]
struct CallSpiderResponse {
    result: String,
}

#[derive(Deserialize)]
struct EngineKindResponse {
    kind: String,
}

#[derive(Deserialize)]
pub struct ProxyPluginResponse {
    pub code: i32,
    pub mime: String,
    #[serde(rename = "bodyBase64")]
    pub body_base64: String,
    pub headers: serde_json::Value,
}

impl<R: Runtime> TvSpiderAndroid<R> {
    fn call_spider(
        &self,
        site_key: String,
        api: String,
        ext: String,
        jar_path: String,
        method: String,
        args_json: String,
    ) -> Result<String, String> {
        let resp: CallSpiderResponse = self
            .0
            .run_mobile_plugin(
                "callSpider",
                TvSpiderCallArgs {
                    site_key,
                    api,
                    ext,
                    jar_path,
                    method,
                    args_json,
                },
            )
            .map_err(|e| e.to_string())?;
        Ok(resp.result)
    }

    fn json_ext(
        &self,
        parse_type: i32,
        name: String,
        url: String,
        flag: String,
    ) -> Result<String, String> {
        let resp: CallSpiderResponse = self
            .0
            .run_mobile_plugin(
                "jsonExt",
                TvJsonExtArgs {
                    parse_type,
                    name,
                    url,
                    flag,
                },
            )
            .map_err(|e| e.to_string())?;
        Ok(resp.result)
    }

    fn proxy(&self, params_json: String) -> Result<ProxyPluginResponse, String> {
        self.0
            .run_mobile_plugin("proxy", TvProxyArgs { params_json })
            .map_err(|e| e.to_string())
    }

    fn engine_kind(&self) -> Result<String, String> {
        let resp: EngineKindResponse = self
            .0
            .run_mobile_plugin("engineKind", ())
            .map_err(|e| e.to_string())?;
        Ok(resp.kind)
    }

    fn clear_cache(&self) -> Result<(), String> {
        let _: serde_json::Value = self
            .0
            .run_mobile_plugin("clearCache", ())
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

pub fn init_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("tv-spider")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle = api.register_android_plugin("com.zkingz.reader.tv", "TvSpiderPlugin")?;
                app.manage(TvSpiderAndroid(handle));
            }
            let _ = (app, api);
            Ok(())
        })
        .build()
}

fn with_tv_spider<R: Runtime, T, F>(app: &tauri::AppHandle<R>, f: F) -> Result<T, String>
where
    F: FnOnce(&TvSpiderAndroid<R>) -> Result<T, String>,
{
    app.try_state::<TvSpiderAndroid<R>>()
        .map(|h| f(&h))
        .ok_or_else(|| "tv-spider plugin not loaded".into())?
}

pub fn invoke_call_spider<R: Runtime>(
    app: &tauri::AppHandle<R>,
    site_key: String,
    api: String,
    ext: String,
    jar: String,
    method: String,
    args_json: String,
) -> Result<String, String> {
    with_tv_spider(app, |p| {
        p.call_spider(site_key, api, ext, jar, method, args_json)
    })
}

pub fn invoke_json_ext<R: Runtime>(
    app: &tauri::AppHandle<R>,
    parse_type: i32,
    name: String,
    url: String,
    flag: String,
) -> Result<String, String> {
    with_tv_spider(app, |p| p.json_ext(parse_type, name, url, flag))
}

pub fn invoke_proxy<R: Runtime>(
    app: &tauri::AppHandle<R>,
    params_json: String,
) -> Result<ProxyPluginResponse, String> {
    with_tv_spider(app, |p| p.proxy(params_json))
}

pub fn invoke_engine_kind<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<String, String> {
    with_tv_spider(app, |p| p.engine_kind())
}

pub fn invoke_clear_cache<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    with_tv_spider(app, |p| p.clear_cache())
}
