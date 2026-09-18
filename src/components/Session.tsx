import { useEffect, useState, useCallback, useRef } from "react";
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  Track,
  LocalParticipant,
} from "livekit-client";
import { leaveSession } from "../lib/tauri-commands";
import MicToggle from "./MicToggle";
import ShareButton from "./ShareButton";
import HandoffModal from "./HandoffModal";

interface SessionProps {
  roomCode: string;
  participantId: string;
  serverUrl: string;
  token: string;
  onLeave: () => void;
}

interface ShareRequest {
  requesterId: string;
}

export default function Session({
  roomCode,
  participantId,
  serverUrl,
  token,
  onLeave,
}: SessionProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [connected, setConnected] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [activeSharer, setActiveSharer] = useState<string | null>(null);
  const [shareRequest, setShareRequest] = useState<ShareRequest | null>(null);
  const [remoteScreenTrack, setRemoteScreenTrack] = useState<RemoteTrackPublication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  const updateParticipants = useCallback((r: Room) => {
    setRemoteParticipants(Array.from(r.remoteParticipants.values()));
    setLocalParticipant(r.localParticipant ?? null);
  }, []);

  const findScreenTrack = useCallback((r: Room) => {
    for (const p of r.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (pub.source === Track.Source.ScreenShare && pub.track) {
          setRemoteScreenTrack(pub);
          return;
        }
      }
    }
    setRemoteScreenTrack(null);
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

    r.on(RoomEvent.ParticipantConnected, () => {
      updateParticipants(r);
    });

    r.on(RoomEvent.ParticipantDisconnected, () => {
      updateParticipants(r);
      findScreenTrack(r);
    });

    r.on(RoomEvent.TrackPublished, (pub, participant) => {
      if (pub.source === Track.Source.ScreenShare) {
        findScreenTrack(r);
        if (participant instanceof RemoteParticipant) {
          setActiveSharer(participant.identity);
        }
      }
    });

    r.on(RoomEvent.TrackUnpublished, (pub) => {
      if (pub.source === Track.Source.ScreenShare) {
        findScreenTrack(r);
        setActiveSharer(null);
      }
    });

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
  }, [serverUrl, token, updateParticipants, findScreenTrack]);

  useEffect(() => {
    if (!remoteScreenTrack?.track) return;
    const el = screenVideoRef.current;
    if (!el) return;
    remoteScreenTrack.track.attach(el);
    return () => {
      remoteScreenTrack.track?.detach(el);
    };
  }, [remoteScreenTrack]);

  const handleShareStarted = () => {
    setIsSharing(true);
    setActiveSharer(participantId);
  };

  const handleShareStopped = () => {
    setIsSharing(false);
    setActiveSharer(null);
  };

  const handleHandoffComplete = async () => {
    setShareRequest(null);
    if (activeSharer === participantId) {
      if (room?.localParticipant) {
        await room.localParticipant.setScreenShareEnabled(true);
        setIsSharing(true);
      }
    } else {
      setIsSharing(false);
      setActiveSharer(null);
    }
  };

  const handleLeave = async () => {
    if (room) {
      room.disconnect();
    }
    await leaveSession(roomCode, participantId);
    onLeave();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>
          Room: <code>{roomCode}</code>
        </h2>
        <button onClick={handleLeave}>Leave</button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <MicToggle localParticipant={localParticipant} />
        <ShareButton
          localParticipant={localParticipant}
          roomCode={roomCode}
          participantId={participantId}
          isSharing={isSharing}
          onShareStarted={handleShareStarted}
          onShareStopped={handleShareStopped}
        />
        <span style={{ padding: "0.5rem 1rem", color: "#666" }}>
          {connected ? "Connected" : "Connecting..."}
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", gap: "1rem" }}>
        <div style={{ flex: 1, background: "#111", borderRadius: 8, position: "relative" }}>
          {remoteScreenTrack?.track ? (
            <video
              ref={screenVideoRef}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <div style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#666",
            }}>
              {activeSharer ? "Screen share loading..." : "No one is sharing their screen"}
            </div>
          )}
        </div>

        <div style={{ width: 200, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>Participants ({remoteParticipants.length + 1})</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <li style={{ padding: "0.25rem 0", fontWeight: "bold" }}>
              You ({participantId.slice(0, 8)})
              {isSharing && <span style={{ color: "#22c55e" }}> (sharing)</span>}
            </li>
            {remoteParticipants.map((p) => (
              <li key={p.identity} style={{ padding: "0.25rem 0" }}>
                {p.identity.slice(0, 8)}
                {activeSharer === p.identity && (
                  <span style={{ color: "#22c55e" }}> (sharing)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {shareRequest && (
        <HandoffModal
          roomCode={roomCode}
          participantId={participantId}
          requesterId={shareRequest.requesterId}
          isCurrentSharer={activeSharer === participantId}
          onHandoffComplete={handleHandoffComplete}
          onDismiss={() => setShareRequest(null)}
        />
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
