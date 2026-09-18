use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

const LIVEKIT_API_KEY: &str = "devkey";
const LIVEKIT_API_SECRET: &str = "secret";

struct AppState {
    sessions: Mutex<HashMap<String, Session>>,
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
    token: String,
    server_url: String,
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
    state.sessions.lock().unwrap().insert(code.clone(), session);
    CreateSessionResponse { code }
}

#[tauri::command]
fn join_session(
    state: State<AppState>,
    code: String,
    participant_id: String,
) -> Result<JoinSessionResponse, String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions
        .get_mut(&code)
        .ok_or_else(|| "Session not found".to_string())?;

    if !session.participants.contains(&participant_id) {
        session.participants.push(participant_id.clone());
    }

    let token = generate_token(&session.code, &participant_id);

    Ok(JoinSessionResponse {
        code: session.code.clone(),
        token,
        server_url: "ws://localhost:7880".to_string(),
    })
}

#[tauri::command]
fn leave_session(
    state: State<AppState>,
    code: String,
    participant_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
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
    let sessions = state.sessions.lock().unwrap();
    sessions
        .get(&code)
        .map(|s| s.participants.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn get_active_sharer(state: State<AppState>, code: String) -> Option<String> {
    let sessions = state.sessions.lock().unwrap();
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
    let mut sessions = state.sessions.lock().unwrap();
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
    let mut sessions = state.sessions.lock().unwrap();
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
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions
        .get_mut(&code)
        .ok_or_else(|| "Session not found".to_string())?;

    if session.active_sharer.as_deref() != Some(&rejector_id) {
        return Err("Only the active sharer can reject".to_string());
    }

    session.pending_share_request = None;
    Ok(())
}

#[tauri::command]
fn stop_sharing(state: State<AppState>, code: String, participant_id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&code) {
        if session.active_sharer.as_deref() == Some(&participant_id) {
            session.active_sharer = None;
        }
    }
    Ok(())
}

#[tauri::command]
fn takeover_share(state: State<AppState>, code: String, participant_id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&code) {
        session.active_sharer = Some(participant_id);
        session.pending_share_request = None;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            sessions: Mutex::new(HashMap::new()),
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
