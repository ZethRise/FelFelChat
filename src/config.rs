use std::env;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub bind_host: String,
    pub app_origin: String,
    pub jwt_secret: String,
    pub database_url: String,
    pub upload_dir: PathBuf,
    pub upload_max_bytes: u64,
    pub backup_dir: PathBuf,
    pub backup_signing_key: String,
    pub audit_log_dir: PathBuf,
    pub node_env: String,
    pub serve_frontend: bool,
    pub next_dev: bool,
    pub next_internal_host: String,
    pub next_internal_port: u16,
    pub sentry_dsn: Option<String>,
    pub debug_errors: bool,
    pub superadmin_username: String,
    pub superadmin_password: Option<String>,
    pub superadmin_display_name: String,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let _ = dotenvy::dotenv();
        let node_env = env::var("NODE_ENV").unwrap_or_else(|_| "development".into());
        let production = node_env == "production";
        let jwt_secret = env::var("JWT_SECRET").map_err(|_| "JWT_SECRET is required")?;
        let database_url = env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is required")?;
        let app_origin = env::var("APP_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".into());
        let backup_signing_key =
            env::var("BACKUP_SIGNING_KEY").unwrap_or_else(|_| String::new());
        let upload_max_mb: u64 = env::var("UPLOAD_MAX_SIZE_MB")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(5);
        let serve_frontend = env::var("SERVE_FRONTEND")
            .ok()
            .map(|v| v != "0" && v != "false")
            .unwrap_or(true);
        let debug_errors = !production || env::var("FELFEL_DEBUG_ERRORS").ok().as_deref() == Some("1");

        Ok(Self {
            port: env::var("PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3000),
            bind_host: env::var("HOSTNAME").unwrap_or_else(|_| "0.0.0.0".into()),
            app_origin,
            jwt_secret,
            database_url,
            upload_dir: PathBuf::from(env::var("UPLOAD_DIR").unwrap_or_else(|_| "./uploads".into())),
            upload_max_bytes: upload_max_mb * 1024 * 1024,
            backup_dir: PathBuf::from(env::var("BACKUP_DIR").unwrap_or_else(|_| "./backups".into())),
            backup_signing_key,
            audit_log_dir: PathBuf::from(
                env::var("AUDIT_LOG_DIR").unwrap_or_else(|_| "./logs".into()),
            ),
            node_env,
            serve_frontend,
            next_dev: env::var("NEXT_DEV").ok().as_deref() == Some("1"),
            next_internal_host: env::var("NEXT_INTERNAL_HOST")
                .unwrap_or_else(|_| "127.0.0.1".into()),
            next_internal_port: env::var("NEXT_INTERNAL_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3001),
            sentry_dsn: env::var("SENTRY_DSN").ok().filter(|s| !s.is_empty()),
            debug_errors,
            superadmin_username: env::var("SUPERADMIN_USERNAME")
                .unwrap_or_else(|_| "admin".into()),
            superadmin_password: env::var("SUPERADMIN_PASSWORD").ok().filter(|s| !s.is_empty()),
            superadmin_display_name: env::var("SUPERADMIN_DISPLAY_NAME")
                .unwrap_or_else(|_| "Super Admin".into()),
        })
    }

    pub fn is_production(&self) -> bool {
        self.node_env == "production"
    }

    pub fn cookie_secure(&self) -> bool {
        self.app_origin.starts_with("https")
    }

    pub fn next_origin(&self) -> String {
        format!(
            "http://{}:{}",
            self.next_internal_host, self.next_internal_port
        )
    }
}
