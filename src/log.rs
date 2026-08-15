use serde_json::{json, Value};
use std::io::{self, Write};

pub fn log_line(level: &str, message: &str, context: Option<Value>) {
    let payload = match context {
        Some(ctx) => json!({
            "ts": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "level": level,
            "message": message,
            "context": ctx,
        }),
        None => json!({
            "ts": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "level": level,
            "message": message,
        }),
    };
    let line = payload.to_string();
    let mut out: Box<dyn Write> = if level == "error" {
        Box::new(io::stderr())
    } else {
        Box::new(io::stdout())
    };
    let _ = writeln!(out, "{line}");
}

pub fn info(message: &str, context: Option<Value>) {
    log_line("info", message, context);
}

pub fn warn(message: &str, context: Option<Value>) {
    log_line("warn", message, context);
}

pub fn error(message: &str, context: Option<Value>) {
    log_line("error", message, context);
}
