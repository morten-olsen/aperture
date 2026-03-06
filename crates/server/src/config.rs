pub struct ServerConfig {
    pub port: u16,
    pub host: String,
    pub data_path: Option<String>,
    pub openai_api_key: String,
    pub openai_base_url: String,
    pub openai_model: String,
    pub openai_embedding_model: String,
}

impl ServerConfig {
    pub fn from_env() -> Result<Self, String> {
        let api_key = std::env::var("OPENAI_API_KEY")
            .map_err(|_| "OPENAI_API_KEY must be set".to_string())?;

        Ok(Self {
            port: std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            data_path: std::env::var("APERTURE_DATA_PATH").ok(),
            openai_api_key: api_key,
            openai_base_url: std::env::var("OPENAI_BASE_URL")
                .unwrap_or_else(|_| "https://api.openai.com/v1".into()),
            openai_model: std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4o".into()),
            openai_embedding_model: std::env::var("OPENAI_EMBEDDING_MODEL")
                .unwrap_or_else(|_| "openai/text-embedding-3-small".into()),
        })
    }
}
