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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
