use std::path::PathBuf;

use async_trait::async_trait;

use aperture_engine::error::Result;
use aperture_engine::plugin::{Plugin, SetupContext};

/// Runtime configuration shared across fs and cli plugins.
#[derive(Debug, Clone)]
pub struct RuntimeConfig {
    pub data_root: PathBuf,
    pub cli_timeout_ms: u64,
    pub cli_max_output_bytes: usize,
}

impl RuntimeConfig {
    /// Resolve the workspace directory for a given user.
    pub fn workspace_dir(&self, user_id: &str) -> PathBuf {
        self.data_root.join(user_id).join("workspace")
    }

    /// Resolve the configs directory for a given user.
    pub fn configs_dir(&self, user_id: &str) -> PathBuf {
        self.data_root.join(user_id).join("configs")
    }
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        let data_root = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".aperture")
            .join("data");

        Self {
            data_root,
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
        }
    }
}

/// Plugin that inserts `RuntimeConfig` into extensions during setup.
/// Must be registered before filesystem and CLI plugins.
pub struct RuntimeConfigPlugin {
    config: RuntimeConfig,
}

impl RuntimeConfigPlugin {
    pub fn new(config: RuntimeConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl Plugin for RuntimeConfigPlugin {
    fn id(&self) -> &str {
        "runtime-config"
    }

    fn description(&self) -> &str {
        "Provides runtime configuration for filesystem and CLI plugins"
    }

    async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
        ctx.extensions.insert(self.config.clone());
        Ok(())
    }
}
