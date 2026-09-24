import { invoke } from "@tauri-apps/api/core";

function assertTauri() {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    throw new Error("Tauri runtime not available. Use the desktop app.");
  }
}

export interface CreateSessionResponse {
  code: string;
}

export interface JoinSessionResponse {
  code: string;
  stream_url: string;
}

export interface Participant {
  id: string;
  name: string;
}

export interface RequestShareResponse {
  needs_approval: boolean;
  current_sharer: string;
}

export async function createSession(
  creatorId: string,
  displayName: string,
): Promise<CreateSessionResponse> {
  assertTauri();
  return invoke("create_session", { creatorId, displayName });
}

export async function joinSession(
  code: string,
  participantId: string,
  displayName: string,
): Promise<JoinSessionResponse> {
  assertTauri();
  return invoke("join_session", { code, participantId, displayName });
}

export async function leaveSession(
  code: string,
  participantId: string,
): Promise<void> {
  assertTauri();
  return invoke("leave_session", { code, participantId });
}

export async function getParticipants(code: string): Promise<Participant[]> {
  assertTauri();
  return invoke("get_participants", { code });
}

export async function getActiveSharer(
  code: string,
): Promise<string | null> {
  assertTauri();
  return invoke("get_active_sharer", { code });
}

export async function getPendingShareRequest(
  code: string,
): Promise<string | null> {
  assertTauri();
  return invoke("get_pending_share_request", { code });
}

export async function cancelShareRequest(
  code: string,
  participantId: string,
): Promise<void> {
  assertTauri();
  return invoke("cancel_share_request", { code, participantId });
}

export async function requestScreenShare(
  code: string,
  participantId: string,
): Promise<RequestShareResponse> {
  assertTauri();
  return invoke("request_screen_share", { code, participantId });
}

export async function approveShareRequest(
  code: string,
  approverId: string,
): Promise<string> {
  assertTauri();
  return invoke("approve_share_request", { code, approverId });
}

export async function rejectShareRequest(
  code: string,
  rejectorId: string,
): Promise<void> {
  assertTauri();
  return invoke("reject_share_request", { code, rejectorId });
}

export async function stopSharing(
  code: string,
  participantId: string,
): Promise<void> {
  assertTauri();
  return invoke("stop_sharing", { code, participantId });
}

export async function takeoverShare(
  code: string,
  participantId: string,
): Promise<void> {
  assertTauri();
  return invoke("takeover_share", { code, participantId });
}

export type Quality = "Low" | "Balanced" | "High";

export async function startStream(
  output?: string,
  quality?: Quality,
): Promise<void> {
  assertTauri();
  return invoke("start_stream", { output: output ?? null, quality: quality ?? null });
}

export async function stopStream(): Promise<void> {
  assertTauri();
  return invoke("stop_stream");
}

export async function startMic(): Promise<void> {
  assertTauri();
  return invoke("start_mic");
}

export async function stopMic(): Promise<void> {
  assertTauri();
  return invoke("stop_mic");
}

export async function getStreamUrl(): Promise<string> {
  assertTauri();
  return invoke("get_stream_url");
}

export async function listOutputs(): Promise<string[]> {
  assertTauri();
  return invoke("list_outputs");
}

export async function getViewerCount(): Promise<number> {
  assertTauri();
  return invoke("get_viewer_count");
}
