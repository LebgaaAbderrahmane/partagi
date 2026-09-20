import { useEffect, useState, useRef, useCallback } from "react";
import {
  leaveSession,
  startStream,
  stopStream,
  listOutputs,
  getParticipants,
  takeoverShare,
} from "../lib/tauri-commands";

interface SessionProps {
  roomCode: string;
  participantId: string;
  streamUrl: string;
  onLeave: () => void;
}

export default function Session({
  roomCode,
  participantId,
  streamUrl,
  onLeave,
}: SessionProps) {
  const [connected, setConnected] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewerCopied, setViewerCopied] = useState(false);
  const viewerUrl = streamUrl.replace(/^ws:\/\//, "http://").replace(/:\d+$/, ":9002");

  const [outputs, setOutputs] = useState<string[]>([]);
  const [selectedOutput, setSelectedOutput] = useState<string>("");
  const [showMonitorPicker, setShowMonitorPicker] = useState(false);

  const [participants, setParticipants] = useState<string[]>([]);
  const [activeSharer, setActiveSharer] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connectWs = useCallback(() => {
    const ws = new WebSocket(streamUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
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
    connectWs();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const p = await getParticipants(roomCode);
        setParticipants(p);
      } catch {}
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [roomCode]);

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
        setIsSharing(false);
        setActiveSharer(null);
      } else if (activeSharer && activeSharer !== participantId) {
        await takeoverShare(roomCode, participantId);
        await startStream(selectedOutput || undefined);
        setIsSharing(true);
        setActiveSharer(participantId);
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
      await startStream(selectedOutput || undefined);
      setIsSharing(true);
      setActiveSharer(participantId);
      setShowMonitorPicker(false);
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
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button className={isSharing ? "danger" : "primary"} onClick={handleShare}>
            {isSharing ? "Stop Sharing" : "Share Screen"}
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
          {connected && !isSharing && !showMonitorPicker && (
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
                        background: selectedOutput === o ? "rgba(var(--primary-rgb, 59,130,246), 0.1)" : "var(--bg)",
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
                <button onClick={() => setShowMonitorPicker(false)} style={{ flex: 1 }}>
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
              <li key={p} style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.4rem 0.5rem",
                borderRadius: "var(--radius)",
                background: p === participantId ? "var(--bg)" : "transparent",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />
                <span style={{ fontSize: "0.85rem", flex: 1 }}>
                  {p.slice(0, 8)}{p === participantId ? " (you)" : ""}
                </span>
                {activeSharer === p && (
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
