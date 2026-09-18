import { invoke } from "@tauri-apps/api/core";

export interface CreateSessionResponse {
  code: string;
}

export interface JoinSessionResponse {
  code: string;
  token: string;
  server_url: string;
}

export interface RequestShareResponse {
  needs_approval: boolean;
  current_sharer: string;
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

export async function getActiveSharer(
  code: string,
): Promise<string | null> {
  return invoke("get_active_sharer", { code });
}

export async function requestScreenShare(
  code: string,
  participantId: string,
): Promise<RequestShareResponse> {
  return invoke("request_screen_share", { code, participantId });
}

export async function approveShareRequest(
  code: string,
  approverId: string,
): Promise<string> {
  return invoke("approve_share_request", { code, approverId });
}

export async function rejectShareRequest(
  code: string,
  rejectorId: string,
): Promise<void> {
  return invoke("reject_share_request", { code, rejectorId });
}

export async function stopSharing(
  code: string,
  participantId: string,
): Promise<void> {
  return invoke("stop_sharing", { code, participantId });
}

export async function takeoverShare(
  code: string,
  participantId: string,
): Promise<void> {
  return invoke("takeover_share", { code, participantId });
}
