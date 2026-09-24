mod stream;

use serde::{Deserialize, Serialize};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::net::UdpSocket;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::State;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_tungstenite::accept_hdr_async;
use uuid::Uuid;

const STREAM_PORT: u16 = 9001;
const VIEWER_PORT: u16 = 9002;
const VIEWER_HTML: &str = include_str!("../viewer.html");
const SESSION_TTL: Duration = Duration::from_secs(30 * 60);
const CODE_LEN: usize = 12;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
enum NetworkMode {
    #[default]
    Lan,
    Remote,
}

#[derive(Clone, Serialize, Deserialize)]
struct NetworkConfig {
    mode: NetworkMode,
    public_host: Option<String>,
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            mode: NetworkMode::Lan,
            public_host: None,
        }
    }
}

#[derive(Serialize)]
struct NetworkInfo {
    mode: NetworkMode,
    lan_ip: String,
    public_host: Option<String>,
    remote_ready: bool,
}

struct AppState {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
    broadcasters: Arc<Mutex<HashMap<String, stream::FrameBroadcaster>>>,
    capture: Mutex<stream::ScreenCapture>,
    mic: Mutex<stream::MicCapture>,
    viewer_count: Arc<AtomicUsize>,
    network: Mutex<NetworkConfig>,
}

#[derive(Clone, Serialize, Deserialize)]
struct Participant {
    id: String,
    name: String,
}

#[derive(Clone)]
struct Session {
    code: String,
    #[allow(dead_code)]
    created_by: String,
    participants: Vec<Participant>,
    active_sharer: Option<String>,
    pending_share_request: Option<String>,
    last_activity: Instant,
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

fn normalize_code(raw: &str) -> String {
    raw.trim().to_uppercase()
}

fn generate_code() -> String {
    Uuid::new_v4().simple().to_string()[..CODE_LEN].to_uppercase()
}

fn get_local_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect(("8.8.8.8", 80))?;
            Ok(s.local_addr()?.ip().to_string())
        })
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn active_host(cfg: &NetworkConfig) -> String {
    match cfg.mode {
        NetworkMode::Lan => get_local_ip(),
        NetworkMode::Remote => cfg
            .public_host
            .as_deref()
            .map(str::trim)
            .filter(|h| !h.is_empty())
            .map(|h| h.to_string())
            .unwrap_or_else(get_local_ip),
    }
}

fn stream_url_for(code: &str, host: &str) -> String {
    format!("ws://{}:{}?room={}", host, STREAM_PORT, code)
}

fn ensure_member(session: &Session, participant_id: &str) -> Result<(), String> {
    if session.participants.iter().any(|p| p.id == participant_id) {
        Ok(())
    } else {
        Err("Not a session participant".to_string())
    }
}

fn touch(session: &mut Session) {
    session.last_activity = Instant::now();
}

#[tauri::command]
fn get_stream_url(state: State<AppState>) -> String {
    let cfg = state.network.blocking_lock();
    format!("ws://{}:{}", active_host(&cfg), STREAM_PORT)
}

#[tauri::command]
fn get_network_info(state: State<AppState>) -> NetworkInfo {
    let cfg = state.network.blocking_lock();
    let lan_ip = get_local_ip();
    let public_host = cfg.public_host.clone();
    let remote_ready = matches!(cfg.mode, NetworkMode::Remote)
        && public_host
            .as_deref()
            .map(|h| !h.trim().is_empty())
            .unwrap_or(false);
    NetworkInfo {
        mode: cfg.mode,
        lan_ip,
        public_host,
        remote_ready,
    }
}

#[tauri::command]
fn set_network_mode(
    state: State<AppState>,
    mode: NetworkMode,
    public_host: Option<String>,
) -> NetworkInfo {
    let mut cfg = state.network.blocking_lock();
    cfg.mode = mode;
    cfg.public_host = public_host
        .map(|h| h.trim().to_string())
        .filter(|h| !h.is_empty());
    let lan_ip = get_local_ip();
    let public_host = cfg.public_host.clone();
    let remote_ready = matches!(cfg.mode, NetworkMode::Remote)
        && public_host
            .as_deref()
            .map(|h| !h.trim().is_empty())
            .unwrap_or(false);
    NetworkInfo {
        mode: cfg.mode,
        lan_ip,
        public_host,
        remote_ready,
    }
}

#[tauri::command]
fn create_session(
    state: State<AppState>,
    creator_id: String,
    display_name: String,
) -> CreateSessionResponse {
    let code = generate_code();
    let session = Session {
        code: code.clone(),
        created_by: creator_id.clone(),
        participants: vec![Participant {
            id: creator_id,
            name: display_name,
        }],
        active_sharer: None,
        pending_share_request: None,
        last_activity: Instant::now(),
    };
    state.sessions.blocking_lock().insert(code.clone(), session);
    state
        .broadcasters
        .blocking_lock()
        .insert(code.clone(), stream::create_broadcaster());
    CreateSessionResponse { code }
}

#[tauri::command]
fn join_session(
    state: State<AppState>,
    code: String,
    participant_id: String,
    display_name: String,
) -> Result<JoinSessionResponse, String> {
    let code = normalize_code(&code);
    let stream_url;
    {
        let mut sessions = state.sessions.blocking_lock();
        let session = sessions
            .get_mut(&code)
            .ok_or_else(|| "Session not found".to_string())?;

        if !session.participants.iter().any(|p| p.id == participant_id) {
            session.participants.push(Participant {
                id: participant_id,
                name: display_name,
            });
        }
        touch(session);
        let host = {
            let cfg = state.network.blocking_lock();
            active_host(&cfg)
        };
        stream_url = stream_url_for(&session.code, &host);
    }

    let mut broadcasters = state.broadcasters.blocking_lock();
    broadcasters
        .entry(code.clone())
        .or_insert_with(stream::create_broadcaster);

    Ok(JoinSessionResponse {
        code,
        stream_url,
    })
}

#[tauri::command]
fn leave_session(
    state: State<AppState>,
    code: String,
    participant_id: String,
) -> Result<(), String> {
    let code = normalize_code(&code);
    let mut sessions = state.sessions.blocking_lock();
    if let Some(session) = sessions.get_mut(&code) {
        session.participants.retain(|p| p.id != participant_id);
        if session.active_sharer.as_deref() == Some(&participant_id) {
            session.active_sharer = None;
        }
        if session.pending_share_request.as_deref() == Some(&participant_id) {
            session.pending_share_request = None;
        }
        if session.participants.is_empty() {
            sessions.remove(&code);
            drop(sessions);
            state.broadcasters.blocking_lock().remove(&code);
        }
    }
    Ok(())
}

#[tauri::command]
fn get_participants(state: State<AppState>, code: String) -> Vec<Participant> {
    let code = normalize_code(&code);
    let mut sessions = state.sessions.blocking_lock();
    sessions
        .get_mut(&code)
        .map(|s| {
            touch(s);
            s.participants.clone()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn get_active_sharer(state: State<AppState>, code: String) -> Option<String> {
    let code = normalize_code(&code);
    let mut sessions = state.sessions.blocking_lock();
    sessions.get_mut(&code).and_then(|s| {
        touch(s);
        s.active_sharer.clone()
    })
}

#[tauri::command]
fn get_pending_share_request(state: State<AppState>, code: String) -> Option<String> {
    let code = normalize_code(&code);
    let mut sessions = state.sessions.blocking_lock();
    sessions.get_mut(&code).and_then(|s| {
        touch(s);
        s.pending_share_request.clone()
    })
}

#[tauri::command]
fn cancel_share_request(
    state: State<AppState>,
    code: String,
    participant_id: String,
) -> Result<(), String> {
    let code = normalize_code(&code);
    let mut sessions = state.sessions.blocking_lock();
    if let Some(session) = sessions.get_mut(&code) {
        ensure_member(session, &participant_id)?;
        touch(session);
        if session.pending_share_request.as_deref() == Some(&participant_id) {
            session.pending_share_request = None;
        }
    }
    Ok(())
}

#[tauri::command]
fn request_screen_share(
    state: State<AppState>,
    code: String,
    participant_id: String,
) -> Result<RequestShareResponse, String> {
    let code = normalize_code(&code);
    let mut sessions = state.sessions.blocking_lock();
    let session = sessions
        .get_mut(&code)
        .ok_or_else(|| "Session not found".to_string())?;
    ensure_member(session, &participant_id)?;
    touch(session);

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
    let code = normalize_code(&code);
    let mut sessions = state.sessions.blocking_lock();
    let session = sessions
        .get_mut(&code)
        .ok_or_else(|| "Session not found".to_string())?;
    ensure_member(session, &approver_id)?;
    touch(session);

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
    let code = normalize_code(&code);
    let mut sessions = state.sessions.blocking_lock();
    let session = sessions
        .get_mut(&code)
        .ok_or_else(|| "Session not found".to_string())?;
    ensure_member(session, &rejector_id)?;
    touch(session);

    if session.active_sharer.as_deref() != Some(&rejector_id) {
        return Err("Only the active sharer can reject".to_string());
    }

    session.pending_share_request = None;
    Ok(())
}

#[tauri::command]
fn stop_sharing(state: State<AppState>, code: String, participant_id: String) -> Result<(), String> {
    let code = normalize_code(&code);
    let mut sessions = state.sessions.blocking_lock();
    if let Some(session) = sessions.get_mut(&code) {
        ensure_member(session, &participant_id)?;
        touch(session);
        if session.active_sharer.as_deref() == Some(&participant_id) {
            session.active_sharer = None;
        }
    }
    Ok(())
}

#[tauri::command]
async fn start_stream(
    state: State<'_, AppState>,
    code: String,
    output: Option<String>,
    quality: Option<stream::Quality>,
) -> Result<(), String> {
    let code = normalize_code(&code);
    let broadcaster = {
        let sessions = state.sessions.lock().await;
        let session = sessions
            .get(&code)
            .ok_or_else(|| "Session not found".to_string())?;
        let broadcasters = state.broadcasters.lock().await;
        broadcasters
            .get(&code)
            .cloned()
            .ok_or_else(|| format!("No media channel for session {}", session.code))?
    };
    let mut capture = state.capture.lock().await;
    capture
        .start(broadcaster, output, quality.unwrap_or_default())
        .await
}

#[tauri::command]
fn stop_stream(state: State<AppState>) -> Result<(), String> {
    let mut capture = state.capture.blocking_lock();
    capture.stop();
    Ok(())
}

#[tauri::command]
async fn start_mic(state: State<'_, AppState>, code: String) -> Result<(), String> {
    let code = normalize_code(&code);
    let broadcaster = {
        let sessions = state.sessions.lock().await;
        sessions
            .get(&code)
            .ok_or_else(|| "Session not found".to_string())?;
        let broadcasters = state.broadcasters.lock().await;
        broadcasters
            .get(&code)
            .cloned()
            .ok_or_else(|| "Session not found".to_string())?
    };
    let mut mic = state.mic.lock().await;
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

#[tauri::command]
fn get_viewer_count(state: State<AppState>) -> usize {
    state.viewer_count.load(Ordering::Relaxed)
}

fn extract_room_from_query(query: Option<&str>) -> Option<String> {
    let query = query?;
    for pair in query.split('&') {
        if let Some(value) = pair.strip_prefix("room=") {
            if !value.is_empty() {
                return Some(normalize_code(value));
            }
        }
    }
    None
}

async fn run_stream_server(
    sessions: Arc<Mutex<HashMap<String, Session>>>,
    broadcasters: Arc<Mutex<HashMap<String, stream::FrameBroadcaster>>>,
    viewer_count: Arc<AtomicUsize>,
) {
    let listener = match TcpListener::bind(("0.0.0.0", STREAM_PORT)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[stream] Failed to bind stream server: {e}");
            return;
        }
    };

    println!("[stream] WebSocket server listening on ws://0.0.0.0:{}", STREAM_PORT);

    loop {
        let Ok((stream, addr)) = listener.accept().await else {
            continue;
        };

        let sessions = sessions.clone();
        let broadcasters = broadcasters.clone();
        let count = viewer_count.clone();

        tokio::spawn(async move {
            use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};

            let mut room = String::new();
            let ws = accept_hdr_async(
                stream,
                |request: &Request, response: Response| {
                    if let Some(code) = extract_room_from_query(request.uri().query()) {
                        room = code;
                    }
                    Ok(response)
                },
            )
            .await;

            let ws = match ws {
                Ok(ws) => ws,
                Err(_) => {
                    println!("[stream] Rejected WS handshake from {} (bad handshake)", addr);
                    return;
                }
            };

            if room.is_empty() {
                println!("[stream] Rejected WS from {}: missing room code", addr);
                return;
            }

            let broadcaster = {
                let sessions_guard = sessions.lock().await;
                if !sessions_guard.contains_key(&room) {
                    drop(sessions_guard);
                    println!("[stream] Rejected WS from {}: unknown room", addr);
                    return;
                }
                let broadcasters_guard = broadcasters.lock().await;
                broadcasters_guard.get(&room).cloned()
            };

            let Some(broadcaster) = broadcaster else {
                println!("[stream] Rejected WS from {}: no media channel", addr);
                return;
            };

            println!("[stream] Viewer connected from {} (room {})", addr, room);
            count.fetch_add(1, Ordering::Relaxed);
            let mut rx = broadcaster.subscribe();
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
            count.fetch_sub(1, Ordering::Relaxed);
            println!("[stream] Viewer {} disconnected", addr);
        });
    }
}

async fn run_viewer_server() {
    use axum::{routing::get, Router};

    let app = Router::new()
        .route("/", get(|| async {
            axum::response::Html(VIEWER_HTML)
        }))
        .route("/health", get(|| async { "ok" }));

    let listener = match tokio::net::TcpListener::bind(("0.0.0.0", VIEWER_PORT)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[viewer] Failed to bind viewer server: {e}");
            return;
        }
    };

    println!("[viewer] HTTP viewer server listening on http://0.0.0.0:{}", VIEWER_PORT);

    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("[viewer] Viewer server error: {e}");
    }
}

async fn run_session_gc(
    sessions: Arc<Mutex<HashMap<String, Session>>>,
    broadcasters: Arc<Mutex<HashMap<String, stream::FrameBroadcaster>>>,
) {
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;
        let expired: Vec<String> = {
            let mut sessions = sessions.lock().await;
            let expired: Vec<String> = sessions
                .iter()
                .filter(|(_, s)| s.last_activity.elapsed() > SESSION_TTL)
                .map(|(k, _)| k.clone())
                .collect();
            for code in &expired {
                sessions.remove(code);
            }
            expired
        };
        if !expired.is_empty() {
            let mut broadcasters = broadcasters.lock().await;
            for code in expired {
                broadcasters.remove(&code);
                println!("[session] Expired idle session {}", code);
            }
        }
    }
}

fn main() {
    let sessions = Arc::new(Mutex::new(HashMap::new()));
    let broadcasters = Arc::new(Mutex::new(HashMap::new()));
    let viewer_count = Arc::new(AtomicUsize::new(0));

    let sessions_for_server = sessions.clone();
    let broadcasters_for_server = broadcasters.clone();
    let viewer_count_for_server = viewer_count.clone();
    let sessions_for_gc = sessions.clone();
    let broadcasters_for_gc = broadcasters.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            sessions,
            broadcasters,
            capture: Mutex::new(stream::ScreenCapture::new()),
            mic: Mutex::new(stream::MicCapture::new()),
            viewer_count,
            network: Mutex::new(NetworkConfig::default()),
        })
        .setup(move |_app| {
            tauri::async_runtime::spawn(run_stream_server(
                sessions_for_server,
                broadcasters_for_server,
                viewer_count_for_server,
            ));
            tauri::async_runtime::spawn(run_viewer_server());
            tauri::async_runtime::spawn(run_session_gc(
                sessions_for_gc,
                broadcasters_for_gc,
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_session,
            join_session,
            leave_session,
            get_participants,
            get_active_sharer,
            get_pending_share_request,
            cancel_share_request,
            request_screen_share,
            approve_share_request,
            reject_share_request,
            stop_sharing,
            start_stream,
            stop_stream,
            start_mic,
            stop_mic,
            get_stream_url,
            get_network_info,
            set_network_mode,
            list_outputs,
            get_viewer_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
