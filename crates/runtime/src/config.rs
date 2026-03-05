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

#[cfg(test)]
mod tests {
    use super::*;
    use aperture_engine::action::Action;
    use aperture_engine::event::EventBus;
    use aperture_engine::extensions::Extensions;

    #[tokio::test]
    async fn config_plugin_inserts_into_extensions() {
        let config = RuntimeConfig {
            data_root: PathBuf::from("/tmp/test-data"),
            cli_timeout_ms: 5_000,
            cli_max_output_bytes: 1_000,
        };
        let plugin = RuntimeConfigPlugin::new(config.clone());

        let mut extensions = Extensions::new();
        let events = EventBus::new();
        let mut actions: Vec<Action> = Vec::new();
        let mut ctx = SetupContext {
            extensions: &mut extensions,
            events: &events,
            actions: &mut actions,
        };

        plugin.setup(&mut ctx).await.unwrap();

        let retrieved = extensions.get::<RuntimeConfig>().unwrap();
        assert_eq!(retrieved.data_root, PathBuf::from("/tmp/test-data"));
        assert_eq!(retrieved.cli_timeout_ms, 5_000);
        assert_eq!(retrieved.cli_max_output_bytes, 1_000);
    }

    #[test]
    fn workspace_and_configs_dir_helpers() {
        let config = RuntimeConfig {
            data_root: PathBuf::from("/data"),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
        };

        assert_eq!(config.workspace_dir("alice"), PathBuf::from("/data/alice/workspace"));
        assert_eq!(config.configs_dir("alice"), PathBuf::from("/data/alice/configs"));
    }

    #[test]
    fn default_config_uses_home_dir() {
        let config = RuntimeConfig::default();
        assert!(
            config.data_root.ends_with(".aperture/data"),
            "expected data_root ending with '.aperture/data', got: {:?}",
            config.data_root
        );
        assert_eq!(config.cli_timeout_ms, 30_000);
        assert_eq!(config.cli_max_output_bytes, 10_000_000);
    }
}
