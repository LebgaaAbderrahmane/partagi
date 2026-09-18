use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::process::Command;

pub type FrameBroadcaster = broadcast::Sender<Vec<u8>>;

pub fn create_broadcaster() -> FrameBroadcaster {
    let (tx, _) = broadcast::channel(4);
    tx
}

pub struct ScreenCapture {
    running: Arc<AtomicBool>,
}

impl ScreenCapture {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub async fn start(&mut self, broadcaster: FrameBroadcaster) -> Result<(), String> {
        if self.running.load(Ordering::Relaxed) {
            return Err("Already capturing".into());
        }

        self.running.store(true, Ordering::Relaxed);
        let running = self.running.clone();

        tokio::spawn(async move {
            while running.load(Ordering::Relaxed) {
                let output = Command::new("grim")
                    .args(["-t", "jpeg", "-q", "60", "/tmp/partagi-capture.jpg"])
                    .output()
                    .await;

                match output {
                    Ok(o) if o.status.success() => {
                        if let Ok(data) = std::fs::read("/tmp/partagi-capture.jpg") {
                            let _ = broadcaster.send(data);
                        }
                    }
                    _ => {}
                }

                tokio::time::sleep(std::time::Duration::from_millis(33)).await;
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
