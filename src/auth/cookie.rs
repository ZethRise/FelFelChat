pub fn parse_token_cookie(header: Option<&str>) -> Option<String> {
    let header = header?;
    for part in header.split(';') {
        let part = part.trim();
        if let Some(value) = part.strip_prefix("token=") {
            let decoded = urlencoding::decode(value).ok()?.into_owned();
            let trimmed = decoded.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

pub fn set_token_header(token: &str, secure: bool) -> String {
    let mut value = format!("token={token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800");
    if secure {
        value.push_str("; Secure");
    }
    value
}

pub fn clear_token_header(secure: bool) -> String {
    let mut value = "token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0".to_string();
    if secure {
        value.push_str("; Secure");
    }
    value
}
