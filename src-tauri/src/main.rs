mod stream;

use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::UdpSocket;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tauri::State;
use tokio_tungstenite::accept_async;
use futures_util::{SinkExt, StreamExt};
use uuid::Uuid;

const LIVEKIT_API_KEY: &str = "devkey";
const LIVEKIT_API_SECRET: &str = "secret";
const LIVEKIT_SERVER_URL: &str = "ws://localhost:7880";
const FRONTEND_URL: &str = "http://localhost:1420";
const STREAM_PORT: u16 = 9001;

struct AppState {
    sessions: Mutex<HashMap<String, Session>>,
    broadcaster: stream::FrameBroadcaster,
    capture: Mutex<stream::ScreenCapture>,
}

#[derive(Clone, Serialize, Deserialize)]
struct Session {
    code: String,
    created_by: String,
    participants: Vec<String>,
    active_sharer: Option<String>,
    pending_share_request: Option<String>,
}

#[derive(Serialize)]
struct CreateSessionResponse {
    code: String,
}

#[derive(Serialize)]
struct JoinSessionResponse {
    code: String,
    stream_url: String,
    session_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct LiveKitGrants {
    #[serde(rename = "nbf")]
    nbf: u64,
    exp: u64,
    #[serde(rename = "iss")]
    iss: String,
    sub: String,
    #[serde(rename = "video")]
    video: VideoGrants,
}

#[derive(Debug, Serialize, Deserialize)]
struct VideoGrants {
    room: String,
    room_join: bool,
    can_publish: bool,
    can_subscribe: bool,
    can_publish_data: bool,
}

fn generate_token(room: &str, identity: &str) -> String {
    let now = Utc::now().timestamp() as u64;
    let grants = LiveKitGrants {
        nbf: now,
        exp: now + 86400,
        iss: LIVEKIT_API_KEY.to_string(),
        sub: identity.to_string(),
        video: VideoGrants {
            room: room.to_string(),
            room_join: true,
            can_publish: true,
            can_subscribe: true,
            can_publish_data: true,
        },
    };

    encode(
        &Header::default(),
        &grants,
        &EncodingKey::from_secret(LIVEKIT_API_SECRET.as_bytes()),
    )
    .expect("Failed to generate token")
}

fn build_session_url(code: &str, token: &str) -> String {
    format!(
        "{}/session?code={}&token={}&server={}",
        FRONTEND_URL, code, token, LIVEKIT_SERVER_URL
    )
}

fn get_local_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect(("8.8.8.8", 80))?;
            Ok(s.local_addr()?.ip().to_string())
        })
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn build_stream_url(_code: &str) -> String {
    format!("ws://{}:{}", get_local_ip(), STREAM_PORT)
}

#[tauri::command]
fn get_stream_url() -> String {
    format!("ws://{}:{}", get_local_ip(), STREAM_PORT)
}

#[tauri::command]
fn create_session(state: State<AppState>, creator_id: String) -> CreateSessionResponse {
    let code = Uuid::new_v4().to_string()[..8].to_string();
    let session = Session {
        code: code.clone(),
        created_by: creator_id,
        participants: vec![],
        active_sharer: None,
        pending_share_request: None,
    };
    state.sessions.blocking_lock().insert(code.clone(), session);
    CreateSessionResponse { code }
}

#[tauri::command]
fn join_session(
    state: State<AppState>,
    code: String,
    participant_id: String,
) -> Result<JoinSessionResponse, String> {
    let mut sessions = state.sessions.blocking_lock();
    let session = sessions
        .get_mut(&code)
        .ok_or_else(|| "Session not found".to_string())?;

    if !session.participants.contains(&participant_id) {
        session.participants.push(participant_id.clone());
    }

    let token = generate_token(&session.code, &participant_id);
    let session_url = build_session_url(&session.code, &token);
    let stream_url = build_stream_url(&session.code);

    Ok(JoinSessionResponse {
        code: session.code.clone(),
        stream_url,
        session_url,
    })
}

#[tauri::command]
fn leave_session(
    state: State<AppState>,
    code: String,
    participant_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.blocking_lock();
    if let Some(session) = sessions.get_mut(&code) {
        session.participants.retain(|p| p != &participant_id);
        if session.active_sharer.as_deref() == Some(&participant_id) {
            session.active_sharer = None;
        }
        if session.pending_share_request.as_deref() == Some(&participant_id) {
            session.pending_share_request = None;
        }
        if session.participants.is_empty() {
            sessions.remove(&code);
        }
    }
    Ok(())
}

#[tauri::command]
fn get_participants(state: State<AppState>, code: String) -> Vec<String> {
    let sessions = state.sessions.blocking_lock();
    sessions
        .get(&code)
        .map(|s| s.participants.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn get_active_sharer(state: State<AppState>, code: String) -> Option<String> {
    let sessions = state.sessions.blocking_lock();
    sessions
        .get(&code)
        .and_then(|s| s.active_sharer.clone())
}

#[tauri::command]
fn request_screen_share(
    state: State<AppState>,
    code: String,
    participant_id: String,
) -> Result<RequestShareResponse, String> {
    let mut sessions = state.sessions.blocking_lock();
    let session = sessions
        .get_mut(&code)
        .ok_or_else(|| "Session not found".to_string())?;

    match &session.active_sharer {
        Some(current) if current == &participant_id => {
            return Err("You are already sharing".to_string());
        }
        Some(current) => {
            session.pending_share_request = Some(participant_id);
            Ok(RequestShareResponse {
                needs_approval: true,
                current_sharer: current.clone(),
            })
        }
        None => {
            session.active_sharer = Some(participant_id);
            Ok(RequestShareResponse {
                needs_approval: false,
                current_sharer: String::new(),
            })
        }
    }
}

#[derive(Serialize)]
struct RequestShareResponse {
    needs_approval: bool,
    current_sharer: String,
}

#[tauri::command]
fn approve_share_request(
    state: State<AppState>,
    code: String,
    approver_id: String,
) -> Result<String, String> {
    let mut sessions = state.sessions.blocking_lock();
    let session = sessions
        .get_mut(&code)
        .ok_or_else(|| "Session not found".to_string())?;

    if session.active_sharer.as_deref() != Some(&approver_id) {
        return Err("Only the active sharer can approve".to_string());
    }

    let requester = session
        .pending_share_request
        .take()
        .ok_or_else(|| "No pending request".to_string())?;

    session.active_sharer = Some(requester.clone());
    Ok(requester)
}

#[tauri::command]
fn reject_share_request(
    state: State<AppState>,
    code: String,
    rejector_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.blocking_lock();
    let session = sessions
        .get_mut(&code)
        .ok_or_else(|| "Session not found".to_string())?;

    if session.active_sharer.as_deref() != Some(&rejector_id) {
        return Err("Only the active sharer can reject".to_string())?;
    }

    session.pending_share_request = None;
    Ok(())
}

#[tauri::command]
fn stop_sharing(state: State<AppState>, code: String, participant_id: String) -> Result<(), String> {
    let mut sessions = state.sessions.blocking_lock();
    if let Some(session) = sessions.get_mut(&code) {
        if session.active_sharer.as_deref() == Some(&participant_id) {
            session.active_sharer = None;
        }
    }
    Ok(())
}

#[tauri::command]
fn takeover_share(state: State<AppState>, code: String, participant_id: String) -> Result<(), String> {
    let mut sessions = state.sessions.blocking_lock();
    if let Some(session) = sessions.get_mut(&code) {
        session.active_sharer = Some(participant_id);
        session.pending_share_request = None;
    }
    Ok(())
}

#[tauri::command]
async fn start_stream(state: State<'_, AppState>) -> Result<(), String> {
    let mut capture = state.capture.lock().await;
    let broadcaster = state.broadcaster.clone();
    capture.start(broadcaster).await
}

#[tauri::command]
fn stop_stream(state: State<AppState>) -> Result<(), String> {
    let mut capture = state.capture.blocking_lock();
    capture.stop();
    Ok(())
}

async fn run_stream_server(broadcaster: stream::FrameBroadcaster) {
    let listener = TcpListener::bind(("0.0.0.0", STREAM_PORT))
        .await
        .expect("Failed to bind stream server");

    println!("[stream] WebSocket server listening on ws://127.0.0.1:{}", STREAM_PORT);

    loop {
        if let Ok((stream, addr)) = listener.accept().await {
            println!("[stream] New viewer connected from {}", addr);
            let mut rx = broadcaster.subscribe();
            tokio::spawn(async move {
                let ws = accept_async(stream)
                    .await
                    .expect("Failed to accept WebSocket");
                let (mut ws_tx, mut ws_rx) = ws.split();

                loop {
                    tokio::select! {
                        frame = rx.recv() => {
                            match frame {
                                Ok(data) => {
                                    if ws_tx.send(tokio_tungstenite::tungstenite::Message::Binary(data.into())).await.is_err() {
                                        break;
                                    }
                                }
                                Err(_) => break,
                            }
                        }
                        msg = ws_rx.next() => {
                            if msg.is_none() {
                                break;
                            }
                        }
                    }
                }
                println!("[stream] Viewer {} disconnected", addr);
            });
        }
    }
}

fn main() {
    let broadcaster = stream::create_broadcaster();
    let broadcaster_for_server = broadcaster.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            sessions: Mutex::new(HashMap::new()),
            broadcaster,
            capture: Mutex::new(stream::ScreenCapture::new()),
        })
        .setup(|_app| {
            tauri::async_runtime::spawn(run_stream_server(broadcaster_for_server));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_session,
            join_session,
            leave_session,
            get_participants,
            get_active_sharer,
            request_screen_share,
            approve_share_request,
            reject_share_request,
            stop_sharing,
            takeover_share,
            start_stream,
            stop_stream,
            get_stream_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
