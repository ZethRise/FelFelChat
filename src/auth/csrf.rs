use axum::http::{HeaderMap, Method};

pub fn csrf_blocked(method: &Method, headers: &HeaderMap, allowed_origin: &str, production: bool) -> bool {
    if !matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    ) {
        return false;
    }

    if let Some(site) = headers.get("sec-fetch-site").and_then(|v| v.to_str().ok()) {
        if !matches!(site, "same-origin" | "same-site" | "none") {
            return true;
        }
    }

    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        return origin != allowed_origin;
    }

    if let Some(referer) = headers.get("referer").and_then(|v| v.to_str().ok()) {
        let prefix = format!("{allowed_origin}/");
        return referer != allowed_origin && !referer.starts_with(&prefix);
    }

    production
}
