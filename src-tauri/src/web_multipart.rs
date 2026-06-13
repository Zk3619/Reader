//! multipart/form-data 解析（WiFi 传书）

pub struct MultipartField {
    pub name: String,
    pub filename: Option<String>,
    pub data: Vec<u8>,
}

pub fn parse_multipart(body: &[u8], content_type: &str) -> Vec<MultipartField> {
    let boundary = content_type
        .split(';')
        .find_map(|part| {
            let part = part.trim();
            part.strip_prefix("boundary=")
                .map(|b| b.trim_matches('"').to_string())
        });
    let Some(boundary) = boundary else {
        return vec![];
    };

    let delimiter = format!("--{}", boundary);
    let text = String::from_utf8_lossy(body);
    let mut fields = Vec::new();

    for part in text.split(&delimiter) {
        let trimmed = part.trim_start_matches("\r\n").trim_end_matches("\r\n");
        if trimmed.is_empty() || trimmed == "--" {
            continue;
        }
        let Some(header_end) = trimmed.find("\r\n\r\n") else {
            continue;
        };
        let header_block = &trimmed[..header_end];
        let body_start = header_end + 4;
        let mut raw_body = &trimmed[body_start..];
        if raw_body.ends_with("\r\n") {
            raw_body = &raw_body[..raw_body.len() - 2];
        }

        let mut name: Option<String> = None;
        let mut filename: Option<String> = None;
        for line in header_block.split("\r\n") {
            let lower = line.to_ascii_lowercase();
            if lower.starts_with("content-disposition:") {
                let value = line.split(':').nth(1).unwrap_or("").trim();
                for segment in value.split(';') {
                    let segment = segment.trim();
                    if let Some(n) = segment.strip_prefix("name=") {
                        name = Some(n.trim_matches('"').to_string());
                    }
                    if let Some(f) = segment.strip_prefix("filename=") {
                        filename = Some(f.trim_matches('"').to_string());
                    }
                }
            }
        }

        let Some(name) = name else { continue };
        fields.push(MultipartField {
            name,
            filename,
            data: raw_body.as_bytes().to_vec(),
        });
    }

    fields
}

pub fn multipart_to_add_local_book_json(fields: &[MultipartField]) -> Option<String> {
    let file_name_field = fields.iter().find(|f| f.name == "fileName");
    let file_data_field = fields.iter().find(|f| f.name == "fileData")?;

    let file_name = file_name_field
        .map(|f| String::from_utf8_lossy(&f.data).trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| file_data_field.filename.clone())
        .unwrap_or_else(|| "upload.bin".to_string());

    use base64::Engine;
    let file_data_base64 = base64::engine::general_purpose::STANDARD.encode(&file_data_field.data);

    Some(
        serde_json::json!({
            "fileName": file_name,
            "fileDataBase64": file_data_base64,
        })
        .to_string(),
    )
}
