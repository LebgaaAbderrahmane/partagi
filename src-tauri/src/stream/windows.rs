use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::io::Cursor;

use cpal::traits::{HostTrait, DeviceTrait};
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
            let mut interval = tokio::time::interval(std::time::Duration::from_millis(33));
            while running.load(Ordering::Relaxed) {
                interval.tick().await;
                let monitors = xcap::Monitor::all().unwrap_or_default();
                let monitor = if let Some(ref name) = output {
                    monitors.iter().find(|m| {
                        m.name().map(|n| n == name.as_str()).unwrap_or(false)
                    }).cloned()
                } else {
                    monitors.into_iter().next()
                };
                if let Some(monitor) = monitor {
                    if let Ok(image) = monitor.capture_image() {
                        let mut buf = Cursor::new(Vec::new());
                        if image.write_to(&mut buf, image::ImageFormat::Jpeg).is_ok() {
                            let _ = broadcaster.send(StreamFrame::Video(buf.into_inner()));
                        }
                    }
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

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Vec<f32>>();
        let (err_tx, err_rx) = tokio::sync::oneshot::channel::<String>();

        std::thread::spawn(move || {
            let host = cpal::default_host();
            let device = match host.default_input_device() {
                Some(d) => d,
                None => {
                    let _ = err_tx.send("No input device found".into());
                    return;
                }
            };
            let config = match device.default_input_config() {
                Ok(c) => c,
                Err(e) => {
                    let _ = err_tx.send(format!("Failed to get input config: {e}"));
                    return;
                }
            };
            let channels = config.channels() as usize;

            let stream = match device.build_input_stream(
                &config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    let mono: Vec<f32> = data
                        .chunks(channels)
                        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
                        .collect();
                    let _ = tx.send(mono);
                },
                move |_err| {},
                None,
            ) {
                Ok(s) => s,
                Err(e) => {
                    let _ = err_tx.send(format!("Failed to build audio stream: {e}"));
                    return;
                }
            };

            stream.play().ok();

            while running.load(Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            drop(stream);
        });

        if let Ok(err) = err_rx.await {
            return Err(err);
        }

        let running_clone = running.clone();
        tokio::spawn(async move {
            while running_clone.load(Ordering::Relaxed) {
                if let Some(samples) = rx.recv().await {
                    let pcm: Vec<i16> = samples
                        .iter()
                        .map(|s| (s.clamp(-1.0, 1.0) * 32767.0) as i16)
                        .collect();
                    let bytes = unsafe {
                        std::slice::from_raw_parts(pcm.as_ptr() as *const u8, pcm.len() * 2)
                    }.to_vec();
                    let _ = broadcaster.send(StreamFrame::Audio(bytes));
                }
            }
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
    xcap::Monitor::all()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|m| m.name().ok())
        .collect()
}
