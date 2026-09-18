import { useEffect, useState, useCallback } from "react";
import {
  Room,
  RoomEvent,
  RemoteParticipant,
} from "livekit-client";
import { leaveSession } from "../lib/tauri-commands";

interface SessionProps {
  roomCode: string;
  participantId: string;
  serverUrl: string;
  token: string;
  onLeave: () => void;
}

export default function Session({
  roomCode,
  participantId,
  serverUrl,
  token,
  onLeave,
}: SessionProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateParticipants = useCallback((r: Room) => {
    setRemoteParticipants(Array.from(r.remoteParticipants.values()));
  }, []);

  useEffect(() => {
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    r.on(RoomEvent.Connected, () => {
      setConnected(true);
      updateParticipants(r);
    });

    r.on(RoomEvent.ParticipantConnected, () => updateParticipants(r));
    r.on(RoomEvent.ParticipantDisconnected, () => updateParticipants(r));

    r.on(RoomEvent.Disconnected, () => {
      setConnected(false);
    });

    r.connect(serverUrl, token).catch((e: Error) => {
      setError(`Connection failed: ${e.message || e}`);
    });

    setRoom(r);

    return () => {
      r.disconnect();
    };
  }, [serverUrl, token, updateParticipants]);

  const handleLeave = async () => {
    if (room) {
      room.disconnect();
    }
    await leaveSession(roomCode, participantId);
    onLeave();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>
          Room: <code>{roomCode}</code>
        </h2>
        <button onClick={handleLeave}>Leave</button>
      </div>

      <div style={{ padding: "0.5rem", background: "#f0f0f0", borderRadius: 4 }}>
        Status: {connected ? "Connected" : "Connecting..."}
      </div>

      <div>
        <h3>Participants ({remoteParticipants.length + 1})</h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          <li style={{ padding: "0.25rem 0", fontWeight: "bold" }}>
            You ({participantId.slice(0, 8)})
          </li>
          {remoteParticipants.map((p) => (
            <li key={p.identity} style={{ padding: "0.25rem 0" }}>
              {p.identity.slice(0, 8)}
            </li>
          ))}
        </ul>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
