use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

#[derive(Clone, Debug)]
pub enum StreamFrame {
    Video(Vec<u8>),
    Audio(Vec<u8>),
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Default)]
pub enum Quality {
    Low,
    #[default]
    Balanced,
    High,
}

impl Quality {
    pub fn scale(&self) -> f32 {
        match self {
            Quality::Low => 0.5,
            Quality::Balanced => 0.75,
            Quality::High => 1.0,
        }
    }

    pub fn jpeg_quality(&self) -> u8 {
        match self {
            Quality::Low => 25,
            Quality::Balanced => 40,
            Quality::High => 60,
        }
    }

    pub fn frame_interval_ms(&self) -> u64 {
        match self {
            Quality::Low => 100,
            Quality::Balanced => 50,
            Quality::High => 33,
        }
    }
}

pub type FrameBroadcaster = broadcast::Sender<StreamFrame>;

pub fn create_broadcaster() -> FrameBroadcaster {
    let (tx, _) = broadcast::channel(8);
    tx
}
