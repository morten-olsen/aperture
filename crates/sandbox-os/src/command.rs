use std::path::PathBuf;
use std::time::Duration;

/// Configuration for a sandboxed command execution.
pub struct SandboxedCommand {
    pub command: String,
    pub working_dir: PathBuf,
    pub timeout: Duration,
    pub max_output_bytes: usize,
    pub allow_network: bool,
    pub writable_paths: Vec<PathBuf>,
    pub readable_paths: Vec<PathBuf>,
}

impl SandboxedCommand {
    pub fn new(command: impl Into<String>, working_dir: impl Into<PathBuf>) -> Self {
        Self {
            command: command.into(),
            working_dir: working_dir.into(),
            timeout: Duration::from_secs(30),
            max_output_bytes: 10_000_000,
            allow_network: false,
            writable_paths: Vec::new(),
            readable_paths: Vec::new(),
        }
    }

    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn max_output_bytes(mut self, max: usize) -> Self {
        self.max_output_bytes = max;
        self
    }

    pub fn allow_network(mut self, allow: bool) -> Self {
        self.allow_network = allow;
        self
    }

    pub fn writable_path(mut self, path: impl Into<PathBuf>) -> Self {
        self.writable_paths.push(path.into());
        self
    }

    pub fn readable_path(mut self, path: impl Into<PathBuf>) -> Self {
        self.readable_paths.push(path.into());
        self
    }
}
