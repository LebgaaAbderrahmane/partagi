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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quality_defaults_to_balanced() {
        assert_eq!(Quality::default(), Quality::Balanced);
    }

    #[test]
    fn quality_scale_table() {
        assert_eq!(Quality::Low.scale(), 0.5);
        assert_eq!(Quality::Balanced.scale(), 0.75);
        assert_eq!(Quality::High.scale(), 1.0);
    }

    #[test]
    fn quality_jpeg_table() {
        assert_eq!(Quality::Low.jpeg_quality(), 25);
        assert_eq!(Quality::Balanced.jpeg_quality(), 40);
        assert_eq!(Quality::High.jpeg_quality(), 60);
    }

    #[test]
    fn quality_interval_table() {
        assert_eq!(Quality::Low.frame_interval_ms(), 100);
        assert_eq!(Quality::Balanced.frame_interval_ms(), 50);
        assert_eq!(Quality::High.frame_interval_ms(), 33);
    }

    #[tokio::test]
    async fn broadcaster_fans_out_to_subscriber() {
        let tx = create_broadcaster();
        let mut rx = tx.subscribe();
        tx.send(StreamFrame::Video(vec![1, 2, 3])).unwrap();
        let frame = rx.recv().await.unwrap();
        match frame {
            StreamFrame::Video(data) => assert_eq!(data, vec![1, 2, 3]),
            _ => panic!("expected video frame"),
        }
    }
}
