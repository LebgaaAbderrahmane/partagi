import { invoke } from "@tauri-apps/api/core";

export interface CreateSessionResponse {
  code: string;
}

export interface JoinSessionResponse {
  code: string;
  token: string;
  server_url: string;
}

export async function createSession(
  creatorId: string,
): Promise<CreateSessionResponse> {
  return invoke("create_session", { creatorId });
}

export async function joinSession(
  code: string,
  participantId: string,
): Promise<JoinSessionResponse> {
  return invoke("join_session", { code, participantId });
}

export async function leaveSession(
  code: string,
  participantId: string,
): Promise<void> {
  return invoke("leave_session", { code, participantId });
}

export async function getParticipants(code: string): Promise<string[]> {
  return invoke("get_participants", { code });
}
