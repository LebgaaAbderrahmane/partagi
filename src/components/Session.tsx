import { useEffect, useState, useRef, useCallback } from "react";
import { leaveSession, startStream, stopStream } from "../lib/tauri-commands";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      wsRef.current?.close();
    };
  }, [connectWs]);

  const handleShare = async () => {
    try {
      if (isSharing) {
        await stopStream();
        setIsSharing(false);
      } else {
        await startStream();
        setIsSharing(true);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleLeave = async () => {
    if (retryRef.current) clearTimeout(retryRef.current);
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
          {connected && !isSharing && (
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
        </div>
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
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
