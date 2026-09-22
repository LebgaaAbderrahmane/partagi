use tokio::sync::broadcast;

#[derive(Clone, Debug)]
pub enum StreamFrame {
    Video(Vec<u8>),
    Audio(Vec<u8>),
}

pub type FrameBroadcaster = broadcast::Sender<StreamFrame>;

pub fn create_broadcaster() -> FrameBroadcaster {
    let (tx, _) = broadcast::channel(8);
    tx
}
