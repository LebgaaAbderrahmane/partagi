import { useEffect, useState, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  leaveSession,
  startStream,
  stopStream,
  startMic,
  stopMic,
  listOutputs,
  getParticipants,
  getActiveSharer,
  getPendingShareRequest,
  getViewerCount,
  requestScreenShare,
  approveShareRequest,
  rejectShareRequest,
  cancelShareRequest,
  stopSharing,
  type Participant,
  type Quality,
} from "../lib/tauri-commands";

interface SessionProps {
  roomCode: string;
  participantId: string;
  displayName: string;
  streamUrl: string;
  onLeave: () => void;
}

export default function Session({
  roomCode,
  participantId,
  displayName,
  streamUrl,
  onLeave,
}: SessionProps) {
  const [connected, setConnected] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewerCopied, setViewerCopied] = useState(false);
  const viewerUrl = streamUrl.replace(/^ws:\/\//, "http://").replace(/:\d+$/, ":9002");

  const [outputs, setOutputs] = useState<string[]>([]);
  const [selectedOutput, setSelectedOutput] = useState<string>("");
  const [showMonitorPicker, setShowMonitorPicker] = useState(false);
  const [quality, setQuality] = useState<Quality>("Balanced");

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeSharer, setActiveSharer] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<string | null>(null);
  const [waitingApproval, setWaitingApproval] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [showQr, setShowQr] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const isSharingRef = useRef(false);

  const selectedOutputRef = useRef("");
  selectedOutputRef.current = selectedOutput;

  const qualityRef = useRef<Quality>(quality);
  qualityRef.current = quality;

  const connectWs = useCallback(() => {
    const ws = new WebSocket(streamUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buf) => {
          const view = new Uint8Array(buf);
          if (view.length < 1) return;

          const type = view[0];
          const payload = view.slice(1);

          if (type === 0x01) {
            const blob = new Blob([payload], { type: "image/jpeg" });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
              const canvas = canvasRef.current;
              if (canvas) {
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  canvas.width = img.width;
                  canvas.height = img.height;
                  ctx.drawImage(img, 0, 0);
                }
              }
              URL.revokeObjectURL(url);
            };
            img.src = url;
          } else if (type === 0x02) {
            const audioCtx = audioCtxRef.current;
            if (audioCtx && audioCtx.state === "running") {
              const int16 = new Int16Array(payload.buffer, payload.byteOffset, payload.byteLength / 2);
              const float32 = new Float32Array(int16.length);
              for (let i = 0; i < int16.length; i++) {
                float32[i] = int16[i] / 32768.0;
              }
              const audioBuffer = audioCtx.createBuffer(1, float32.length, 16000);
              audioBuffer.getChannelData(0).set(float32);
              const source = audioCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioCtx.destination);
              source.start();
            }
          }
        });
      }
    };

    ws.onclose = () => {
      setConnected(false);
      retryRef.current = setTimeout(connectWs, 1000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [streamUrl]);

  useEffect(() => {
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = audioCtx;
    if (audioCtx.state === "running") {
      setAudioUnlocked(true);
    }
    connectWs();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      wsRef.current?.close();
      audioCtxRef.current?.close();
    };
  }, [connectWs]);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const [p, sharer, pending, viewers] = await Promise.all([
          getParticipants(roomCode),
          getActiveSharer(roomCode),
          getPendingShareRequest(roomCode),
          getViewerCount(),
        ]);
        setParticipants(p);
        setActiveSharer(sharer);
        setPendingRequest(pending);
        setViewerCount(viewers);

        if (waitingApproval && sharer === participantId) {
          setWaitingApproval(false);
          await loadOutputs();
          setShowMonitorPicker(true);
        }

        if (isSharingRef.current && sharer !== participantId) {
          isSharingRef.current = false;
          setIsSharing(false);
          stopStream().catch(() => {});
        }
      } catch {}
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [roomCode, participantId, waitingApproval]);

  const unlockAudio = async () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (ctx.state === "running") {
      setAudioUnlocked(true);
    }
  };

  const loadOutputs = async () => {
    try {
      const o = await listOutputs();
      setOutputs(o);
      if (o.length > 0 && !selectedOutput) {
        setSelectedOutput(o[0]);
      }
    } catch {
      setOutputs([]);
    }
  };

  const handleShare = async () => {
    try {
      if (isSharing) {
        await stopStream();
        await stopSharing(roomCode, participantId);
        setIsSharing(false);
        isSharingRef.current = false;
        setActiveSharer(null);
      } else if (waitingApproval) {
        await cancelShareRequest(roomCode, participantId);
        setWaitingApproval(false);
      } else if (activeSharer && activeSharer !== participantId) {
        const res = await requestScreenShare(roomCode, participantId);
        if (res.needs_approval) {
          setWaitingApproval(true);
        } else {
          await loadOutputs();
          setShowMonitorPicker(true);
        }
      } else {
        await loadOutputs();
        setShowMonitorPicker(true);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleStartShare = async () => {
    try {
      if (!activeSharer || activeSharer === participantId) {
        await requestScreenShare(roomCode, participantId);
      }
      await startStream(selectedOutput || undefined, quality);
      setIsSharing(true);
      isSharingRef.current = true;
      setActiveSharer(participantId);
      setWaitingApproval(false);
      setShowMonitorPicker(false);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleQualityChange = async (q: Quality) => {
    setQuality(q);
    if (isSharingRef.current) {
      try {
        await stopStream();
        await startStream(selectedOutputRef.current || undefined, q);
      } catch (e) {
        setError(String(e));
      }
    }
  };

  const handleCancelShare = () => {
    setShowMonitorPicker(false);
  };

  const handleApprove = async () => {
    try {
      if (isSharing) {
        await stopStream();
        setIsSharing(false);
        isSharingRef.current = false;
      }
      await approveShareRequest(roomCode, participantId);
      setPendingRequest(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleReject = async () => {
    try {
      await rejectShareRequest(roomCode, participantId);
      setPendingRequest(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleToggleMic = async () => {
    try {
      if (isMicOn) {
        await stopMic();
        setIsMicOn(false);
      } else {
        await unlockAudio();
        await startMic();
        setIsMicOn(true);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleLeave = async () => {
    if (retryRef.current) clearTimeout(retryRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    if (isSharing) {
      await stopStream();
    }
    if (isMicOn) {
      await stopMic();
    }
    wsRef.current?.close();
    await leaveSession(roomCode, participantId);
    onLeave();
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyViewerUrl = async () => {
    await navigator.clipboard.writeText(viewerUrl);
    setViewerCopied(true);
    setTimeout(() => setViewerCopied(false), 2000);
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
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {displayName}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <code style={{ fontSize: "0.8rem" }}>{roomCode}</code>
            <button onClick={copyCode} style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}>
              {copied ? "Copied" : "Copy Code"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <code style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{viewerUrl}</code>
            <button onClick={copyViewerUrl} style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}>
              {viewerCopied ? "Copied" : "Copy Link"}
            </button>
            <button onClick={() => setShowQr(true)} style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}>
              QR
            </button>
          </div>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            background: "var(--bg)",
            padding: "0.2rem 0.6rem",
            borderRadius: 12,
          }}>
            <span style={{ fontSize: "0.85rem" }}>👁</span>
            {viewerCount} watching
          </div>
        </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Quality</label>
            <select
              value={quality}
              onChange={(e) => handleQualityChange(e.target.value as Quality)}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--text)",
                padding: "0.3rem 0.5rem",
                fontSize: "0.8rem",
                outline: "none",
              }}
            >
              <option value="Low">Low</option>
              <option value="Balanced">Balanced</option>
              <option value="High">High</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button
            className={isMicOn ? "primary" : ""}
            onClick={handleToggleMic}
            style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem" }}
          >
            {isMicOn ? "Mic On" : "Mic Off"}
          </button>
          <button
            className={isSharing ? "danger" : waitingApproval ? "" : "primary"}
            onClick={handleShare}
          >
            {isSharing
              ? "Stop Sharing"
              : waitingApproval
                ? "Cancel Request"
                : "Share Screen"}
          </button>
          <button className="danger" onClick={handleLeave}>Leave</button>
          </div>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, background: "#000", position: "relative" }}>
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
          {!connected && (
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "var(--text-muted)",
              textAlign: "center",
            }}>
              <p>Connecting to stream server...</p>
            </div>
          )}
          {connected && activeSharer && activeSharer !== participantId && !showMonitorPicker && (
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "var(--text-muted)",
              textAlign: "center",
            }}>
              <p>
                {participants.find((p) => p.id === activeSharer)?.name ||
                  activeSharer.slice(0, 8)}{" "}
                is sharing their screen
              </p>
              {waitingApproval ? (
                <p style={{ fontSize: "0.8rem", color: "var(--accent)" }}>
                  Waiting for approval to share...
                </p>
              ) : (
                <p style={{ fontSize: "0.8rem" }}>
                  Click "Share Screen" to request control
                </p>
              )}
            </div>
          )}
          {connected &&
            waitingApproval &&
            (!activeSharer || activeSharer === participantId) &&
            !showMonitorPicker && (
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "var(--text-muted)",
              textAlign: "center",
            }}>
              <p>Request approved!</p>
              <p style={{ fontSize: "0.8rem" }}>Choose a display to share</p>
            </div>
          )}
          {connected &&
            isSharing &&
            pendingRequest &&
            pendingRequest !== participantId &&
            !showMonitorPicker && (
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              minWidth: 280,
              textAlign: "center",
            }}>
              <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                {participants.find((p) => p.id === pendingRequest)?.name ||
                  pendingRequest.slice(0, 8)}{" "}
                wants to share their screen
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={handleReject} style={{ flex: 1 }}>
                  Decline
                </button>
                <button className="primary" onClick={handleApprove} style={{ flex: 1 }}>
                  Approve
                </button>
              </div>
            </div>
          )}
          {connected && !activeSharer && !isSharing && !showMonitorPicker && (
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "var(--text-muted)",
              textAlign: "center",
            }}>
              <p>No one is sharing their screen</p>
              <p style={{ fontSize: "0.8rem" }}>Click "Share Screen" to get started</p>
            </div>
          )}
          {connected && !audioUnlocked && activeSharer && activeSharer !== participantId && (
            <button
              onClick={unlockAudio}
              style={{
                position: "absolute",
                bottom: 16,
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--accent)",
                border: "none",
                color: "white",
                padding: "0.5rem 1rem",
                borderRadius: "var(--radius)",
                fontSize: "0.85rem",
              }}
            >
              Tap to hear audio
            </button>
          )}
          {showQr && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 200,
              }}
              onClick={() => setShowQr(false)}
            >
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "2rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "1rem",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>Scan to view on mobile</p>
                <div style={{ background: "white", padding: "1rem", borderRadius: "var(--radius)" }}>
                  <QRCodeSVG value={viewerUrl} size={200} />
                </div>
                <code style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{viewerUrl}</code>
                <button onClick={() => setShowQr(false)}>Close</button>
              </div>
            </div>
          )}
          {showMonitorPicker && (
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              minWidth: 280,
            }}>
              <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>Select Display</p>
              {outputs.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {outputs.map((o) => (
                    <label
                      key={o}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.5rem 0.75rem",
                        borderRadius: "var(--radius)",
                        border: selectedOutput === o ? "1px solid var(--primary)" : "1px solid var(--border)",
                        background: selectedOutput === o ? "rgba(59,130,246,0.1)" : "var(--bg)",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="radio"
                        name="output"
                        value={o}
                        checked={selectedOutput === o}
                        onChange={() => setSelectedOutput(o)}
                        style={{ width: "auto" }}
                      />
                      {o}
                    </label>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No displays found</p>
              )}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={handleCancelShare} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button className="primary" onClick={handleStartShare} style={{ flex: 1 }}>
                  Start Sharing
                </button>
              </div>
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
              {participants.length}
            </span>
          </div>

          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {participants.map((p) => (
              <li key={p.id} style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.4rem 0.5rem",
                borderRadius: "var(--radius)",
                background: p.id === participantId ? "var(--bg)" : "transparent",
              }}>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: p.id === participantId ? "var(--accent)" : "var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: p.id === participantId ? "white" : "var(--text-muted)",
                  flexShrink: 0,
                }}>
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <span style={{ fontSize: "0.85rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                  {p.id === participantId && (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}> (you)</span>
                  )}
                </span>
                {activeSharer === p.id && (
                  <span style={{
                    fontSize: "0.65rem",
                    color: "var(--success)",
                    background: "rgba(34,197,94,0.15)",
                    padding: "0.1rem 0.4rem",
                    borderRadius: 8,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                  }}>
                    sharing
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.4rem 0.75rem",
            background: "var(--bg)",
            borderRadius: "var(--radius)",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
          }}>
            <span>{connected ? "Connected to server" : "Connecting..."}</span>
            <span style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: activeSharer ? "var(--success)" : "var(--text-muted)",
              }} />
              {activeSharer ? "Sharing active" : "Idle"}
            </span>
          </div>
        </aside>
      </div>

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
          zIndex: 100,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
