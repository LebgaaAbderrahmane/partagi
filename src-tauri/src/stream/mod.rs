pub mod common;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::{ScreenCapture, MicCapture, list_outputs_sync};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::{ScreenCapture, MicCapture, list_outputs_sync};

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::{ScreenCapture, MicCapture, list_outputs_sync};

pub use common::{StreamFrame, FrameBroadcaster, create_broadcaster};
