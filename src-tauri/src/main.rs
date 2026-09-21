mod stream;

use serde::{Deserialize, Serialize};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::net::UdpSocket;
use tauri::State;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_tungstenite::accept_async;
use uuid::Uuid;

const STREAM_PORT: u16 = 9001;
const VIEWER_PORT: u16 = 9002;
const VIEWER_HTML: &str = include_str!("../viewer.html");

struct AppState {
    sessions: Mutex<HashMap<String, Session>>,
    broadcaster: stream::FrameBroadcaster,
    capture: Mutex<stream::ScreenCapture>,
    mic: Mutex<stream::MicCapture>,
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
}

fn get_local_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect(("8.8.8.8", 80))?;
            Ok(s.local_addr()?.ip().to_string())
        })
        .unwrap_or_else(|_| "127.0.0.1".to_string())
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

    let stream_url = format!("ws://{}:{}", get_local_ip(), STREAM_PORT);

    Ok(JoinSessionResponse {
        code: session.code.clone(),
        stream_url,
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
async fn start_stream(state: State<'_, AppState>, output: Option<String>) -> Result<(), String> {
    let mut capture = state.capture.lock().await;
    let broadcaster = state.broadcaster.clone();
    capture.start(broadcaster, output).await
}

#[tauri::command]
fn stop_stream(state: State<AppState>) -> Result<(), String> {
    let mut capture = state.capture.blocking_lock();
    capture.stop();
    Ok(())
}

#[tauri::command]
async fn start_mic(state: State<'_, AppState>) -> Result<(), String> {
    let mut mic = state.mic.lock().await;
    let broadcaster = state.broadcaster.clone();
    mic.start(broadcaster).await
}

#[tauri::command]
fn stop_mic(state: State<AppState>) -> Result<(), String> {
    let mut mic = state.mic.blocking_lock();
    mic.stop();
    Ok(())
}

#[tauri::command]
fn list_outputs() -> Vec<String> {
    stream::list_outputs_sync()
}

async fn run_stream_server(broadcaster: stream::FrameBroadcaster) {
    let listener = TcpListener::bind(("0.0.0.0", STREAM_PORT))
        .await
        .expect("Failed to bind stream server");

    println!("[stream] WebSocket server listening on ws://0.0.0.0:{}", STREAM_PORT);

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
                                Ok(stream::StreamFrame::Video(data)) => {
                                    let mut msg = Vec::with_capacity(1 + data.len());
                                    msg.push(0x01);
                                    msg.extend_from_slice(&data);
                                    if ws_tx.send(tokio_tungstenite::tungstenite::Message::Binary(msg.into())).await.is_err() {
                                        break;
                                    }
                                }
                                Ok(stream::StreamFrame::Audio(data)) => {
                                    let mut msg = Vec::with_capacity(1 + data.len());
                                    msg.push(0x02);
                                    msg.extend_from_slice(&data);
                                    if ws_tx.send(tokio_tungstenite::tungstenite::Message::Binary(msg.into())).await.is_err() {
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

async fn run_viewer_server() {
    use axum::{routing::get, Router};

    let app = Router::new()
        .route("/", get(|| async {
            axum::response::Html(VIEWER_HTML)
        }))
        .route("/health", get(|| async { "ok" }));

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", VIEWER_PORT))
        .await
        .expect("Failed to bind viewer server");

    println!("[viewer] HTTP viewer server listening on http://0.0.0.0:{}", VIEWER_PORT);

    axum::serve(listener, app)
        .await
        .expect("Viewer server failed");
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
            mic: Mutex::new(stream::MicCapture::new()),
        })
        .setup(|_app| {
            tauri::async_runtime::spawn(run_stream_server(broadcaster_for_server));
            tauri::async_runtime::spawn(run_viewer_server());
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
            start_mic,
            stop_mic,
            get_stream_url,
            list_outputs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
