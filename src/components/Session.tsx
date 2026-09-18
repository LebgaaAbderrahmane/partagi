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
  const [copied, setCopied] = useState(false);
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
    console.log("[Session] Mounting", {
      roomCode,
      participantId,
      serverUrl,
      token: token.slice(0, 30) + "...",
      url: window.location.href,
    });
    console.log("[Session] WebRTC check:", {
      RTCPeerConnection: typeof RTCPeerConnection,
      mediaDevices: typeof navigator.mediaDevices,
      getUserMedia: typeof navigator.mediaDevices?.getUserMedia,
      userAgent: navigator.userAgent,
    });

    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    r.on(RoomEvent.Connected, () => {
      console.log("[Session] Connected");
      setConnected(true);
      updateParticipants(r);
    });

    r.on(RoomEvent.ParticipantConnected, (p) => {
      console.log("[Session] Participant joined:", p.identity);
      updateParticipants(r);
    });
    r.on(RoomEvent.ParticipantDisconnected, (p) => {
      console.log("[Session] Participant left:", p.identity);
      updateParticipants(r);
      findScreenTrack(r);
    });

    r.on(RoomEvent.TrackPublished, (pub, participant) => {
      console.log("[Session] Track published:", pub.source, "by", participant.identity);
      if (pub.source === Track.Source.ScreenShare) {
        findScreenTrack(r);
        if (participant instanceof RemoteParticipant) {
          setActiveSharer(participant.identity);
        }
      }
    });

    r.on(RoomEvent.TrackUnpublished, (pub) => {
      console.log("[Session] Track unpublished:", pub.source);
      if (pub.source === Track.Source.ScreenShare) {
        findScreenTrack(r);
        setActiveSharer(null);
      }
    });

    r.on(RoomEvent.Disconnected, () => {
      console.log("[Session] Disconnected");
      setConnected(false);
    });

    console.log("[Session] Calling r.connect...");
    r.connect(serverUrl, token).catch((e: Error) => {
      console.error("[Session] Connect failed:", e);
      setError(`Connection failed: ${e.message || e}`);
    });

    setRoom(r);
    return () => {
      void r.disconnect();
    };
  }, [serverUrl, token, updateParticipants, findScreenTrack, roomCode, participantId]);

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
      void room.disconnect();
    }
    await leaveSession(roomCode, participantId);
    onLeave();
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.75rem 1.25rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Partagi</span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <code style={{ fontSize: "0.8rem" }}>{roomCode}</code>
            <button onClick={copyCode} style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <MicToggle localParticipant={localParticipant} />
          <ShareButton
            localParticipant={localParticipant}
            roomCode={roomCode}
            participantId={participantId}
            isSharing={isSharing}
            onShareStarted={handleShareStarted}
            onShareStopped={handleShareStopped}
          />
          <button className="danger" onClick={handleLeave}>Leave</button>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, background: "#000", position: "relative" }}>
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
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.75rem",
            }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--surface)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.5rem",
                color: "var(--text-muted)",
              }}>
                {activeSharer ? "..." : "~"}
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                {activeSharer ? "Screen share loading..." : "No one is sharing their screen"}
              </p>
              {!activeSharer && (
                <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                  Click "Share Screen" to get started
                </p>
              )}
            </div>
          )}
        </div>

        <aside style={{
          width: 220,
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          overflow: "auto",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Participants
            </h3>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", background: "var(--bg)", padding: "0.15rem 0.5rem", borderRadius: 12 }}>
              {remoteParticipants.length + 1}
            </span>
          </div>

          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <li style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.5rem", borderRadius: "var(--radius)", background: "var(--bg)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />
              <span style={{ fontSize: "0.85rem", flex: 1 }}>You</span>
              {isSharing && <span style={{ fontSize: "0.7rem", color: "var(--success)" }}>sharing</span>}
            </li>
            {remoteParticipants.map((p) => (
              <li key={p.identity} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.5rem", borderRadius: "var(--radius)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />
                <span style={{ fontSize: "0.85rem", flex: 1 }}>{p.identity.slice(0, 8)}</span>
                {activeSharer === p.identity && (
                  <span style={{ fontSize: "0.7rem", color: "var(--success)" }}>sharing</span>
                )}
              </li>
            ))}
          </ul>

          <div style={{ marginTop: "auto", padding: "0.5rem", background: "var(--bg)", borderRadius: "var(--radius)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {connected ? "Connected to server" : "Connecting..."}
          </div>
        </aside>
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

      {error && (
        <div style={{
          position: "fixed",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--danger)",
          color: "white",
          padding: "0.5rem 1rem",
          borderRadius: "var(--radius)",
          fontSize: "0.85rem",
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
