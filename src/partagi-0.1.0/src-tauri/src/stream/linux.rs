use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

use super::common::{FrameBroadcaster, StreamFrame};

pub struct ScreenCapture {
    running: Arc<AtomicBool>,
}

impl ScreenCapture {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub async fn start(&mut self, broadcaster: FrameBroadcaster, output: Option<String>) -> Result<(), String> {
        if self.running.load(Ordering::Relaxed) {
            return Err("Already capturing".into());
        }

        self.running.store(true, Ordering::Relaxed);
        let running = self.running.clone();

        tokio::spawn(async move {
            while running.load(Ordering::Relaxed) {
                let mut args = vec!["-c", "-t", "jpeg", "-q", "40", "-s", "0.75"];
                if let Some(ref o) = output {
                    args.extend(["-o", o]);
                }
                args.push("/tmp/partagi-capture.jpg");

                let output = Command::new("grim")
                    .args(&args)
                    .output()
                    .await;

                match output {
                    Ok(o) if o.status.success() => {
                        if let Ok(data) = std::fs::read("/tmp/partagi-capture.jpg") {
                            let _ = broadcaster.send(StreamFrame::Video(data));
                        }
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
    }
}

impl Drop for ScreenCapture {
    fn drop(&mut self) {
        self.stop();
    }
}

pub struct MicCapture {
    running: Arc<AtomicBool>,
}

impl MicCapture {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub async fn start(&mut self, broadcaster: FrameBroadcaster) -> Result<(), String> {
        if self.running.load(Ordering::Relaxed) {
            return Err("Mic already capturing".into());
        }

        self.running.store(true, Ordering::Relaxed);
        let running = self.running.clone();

        let mut child = Command::new("ffmpeg")
            .args([
                "-f", "pulse",
                "-i", "default",
                "-ac", "1",
                "-ar", "16000",
                "-f", "s16le",
                "-loglevel", "quiet",
                "pipe:1",
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to start ffmpeg: {e}"))?;

        let mut stdout = child.stdout.take().ok_or("Failed to capture ffmpeg stdout")?;

        tokio::spawn(async move {
            let mut buf = vec![0u8; 3200];
            while running.load(Ordering::Relaxed) {
                tokio::select! {
                    result = stdout.read(&mut buf) => {
                        match result {
                            Ok(0) => break,
                            Ok(n) => {
                                let data = buf[..n].to_vec();
                                let _ = broadcaster.send(StreamFrame::Audio(data));
                            }
                            Err(_) => break,
                        }
                    }
                }
            }
            let _ = child.kill().await;
        });

        Ok(())
    }

    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
    }
}

impl Drop for MicCapture {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn list_outputs_sync() -> Vec<String> {
    std::process::Command::new("hyprctl")
        .arg("monitors")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                let stdout = String::from_utf8_lossy(&o.stdout);
                Some(
                    stdout
                        .lines()
                        .filter_map(|line| {
                            line.strip_prefix("Monitor ")
                                .and_then(|rest| rest.split_whitespace().next())
                                .map(|name| name.to_string())
                        })
                        .collect(),
                )
            } else {
                None
            }
        })
        .unwrap_or_default()
}
