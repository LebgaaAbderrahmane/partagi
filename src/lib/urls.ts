export function streamHostFromUrl(streamUrl: string): string {
  return streamUrl
    .replace(/^wss?:\/\//, "")
    .split("?")[0]
    .replace(/:\d+$/, "");
}

export function viewerUrlFromStream(
  streamUrl: string,
  roomCode: string,
): string {
  const host = streamHostFromUrl(streamUrl);
  return `http://${host}:9002/?room=${encodeURIComponent(roomCode)}`;
}

export function wsUrlWithRoom(baseUrl: string, roomCode: string): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}room=${encodeURIComponent(roomCode)}`;
}
