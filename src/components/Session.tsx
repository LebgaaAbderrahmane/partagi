import { useEffect, useState, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Eye,
  Copy,
  Check,
  QrCode,
  Mic,
  MicOff,
  ScreenShare,
  ScreenShareOff,
  LogOut,
} from "lucide-react";
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
import { Button, Modal, Avatar, Badge, useToast } from "./ui";

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
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
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
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

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
      toast(String(e), "error");
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
      toast(String(e), "error");
    }
  };

  const handleQualityChange = async (q: Quality) => {
    setQuality(q);
    if (isSharingRef.current) {
      try {
        await stopStream();
        await startStream(selectedOutputRef.current || undefined, q);
      } catch (e) {
        toast(String(e), "error");
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
      toast(String(e), "error");
    }
  };

  const handleReject = async () => {
    try {
      await rejectShareRequest(roomCode, participantId);
      setPendingRequest(null);
    } catch (e) {
      toast(String(e), "error");
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
      toast(String(e), "error");
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

  const handleRequestLeave = () => {
    setShowLeaveConfirm(true);
  };

  const handleConfirmLeave = async () => {
    setShowLeaveConfirm(false);
    await handleLeave();
  };

  const actionsRef = useRef({
    handleShare: async () => {},
    handleToggleMic: async () => {},
    handleRequestLeave: () => {},
  });
  actionsRef.current = {
    handleShare,
    handleToggleMic,
    handleRequestLeave,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.key === "Escape") {
        if (showLeaveConfirm) setShowLeaveConfirm(false);
        return;
      }

      if (showLeaveConfirm || showQr || showMonitorPicker) return;

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.shiftKey && e.code === "KeyQ") {
        e.preventDefault();
        actionsRef.current.handleRequestLeave();
        return;
      }

      if (e.shiftKey) return;

      if (e.code === "KeyS") {
        e.preventDefault();
        void actionsRef.current.handleShare();
      } else if (e.code === "KeyM") {
        e.preventDefault();
        void actionsRef.current.handleToggleMic();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showLeaveConfirm, showQr, showMonitorPicker]);

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

  const sharerName =
    activeSharer != null
      ? participants.find((p) => p.id === activeSharer)?.name ||
        activeSharer.slice(0, 8)
      : "";

  const requesterName =
    pendingRequest != null
      ? participants.find((p) => p.id === pendingRequest)?.name ||
        pendingRequest.slice(0, 8)
      : "";

  return (
    <div className="session">
      <header className="session-header">
        <div className="row row-gap-lg">
          <span className="session-brand">Partagi</span>
          <span className="small muted">{displayName}</span>
          <div className="row row-gap">
            <code>{roomCode}</code>
            <Button size="sm" onClick={copyCode}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy Code"}
            </Button>
          </div>
          <div className="row row-gap">
            <code className="caption muted">{viewerUrl}</code>
            <Button size="sm" onClick={copyViewerUrl}>
              {viewerCopied ? <Check size={12} /> : <Copy size={12} />}
              {viewerCopied ? "Copied" : "Copy Link"}
            </Button>
            <Button size="sm" onClick={() => setShowQr(true)} aria-label="Show QR code">
              <QrCode size={12} />
              QR
            </Button>
          </div>
          <div className="viewer-chip">
            <Eye size={14} />
            {viewerCount} watching
          </div>
        </div>

        <div className="row row-gap">
          <div className="quality-select">
            <label htmlFor="quality">Quality</label>
            <select
              id="quality"
              value={quality}
              onChange={(e) => handleQualityChange(e.target.value as Quality)}
            >
              <option value="Low">Low</option>
              <option value="Balanced">Balanced</option>
              <option value="High">High</option>
            </select>
          </div>
          <Button
            variant={isMicOn ? "primary" : "default"}
            size="md"
            onClick={handleToggleMic}
            title="Toggle microphone (M)"
          >
            {isMicOn ? <Mic size={14} /> : <MicOff size={14} />}
            {isMicOn ? "Mic On" : "Mic Off"}
          </Button>
          <Button
            variant={isSharing ? "danger" : waitingApproval ? "default" : "primary"}
            onClick={handleShare}
            title="Share screen (S)"
          >
            {isSharing ? <ScreenShareOff size={14} /> : <ScreenShare size={14} />}
            {isSharing
              ? "Stop Sharing"
              : waitingApproval
                ? "Cancel Request"
                : "Share Screen"}
          </Button>
          <Button
            variant="danger"
            onClick={handleRequestLeave}
            title="Leave session (Shift+Q)"
          >
            <LogOut size={14} />
            Leave
          </Button>
        </div>
      </header>

      <div className="session-body">
        <div className="stage">
          <canvas ref={canvasRef} />

          {!connected && (
            <div className="stage-overlay">
              <p>Connecting to stream server...</p>
            </div>
          )}

          {connected && activeSharer && activeSharer !== participantId && !showMonitorPicker && (
            <div className="stage-overlay">
              <p>{sharerName} is sharing their screen</p>
              {waitingApproval ? (
                <p className="accent">Waiting for approval to share...</p>
              ) : (
                <p className="hint">Click "Share Screen" to request control</p>
              )}
            </div>
          )}

          {connected &&
            waitingApproval &&
            (!activeSharer || activeSharer === participantId) &&
            !showMonitorPicker && (
              <div className="stage-overlay">
                <p>Request approved!</p>
                <p className="hint">Choose a display to share</p>
              </div>
            )}

          {connected &&
            isSharing &&
            pendingRequest &&
            pendingRequest !== participantId &&
            !showMonitorPicker && (
              <div className="card" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
                <p className="card-title">{requesterName} wants to share their screen</p>
                <div className="row row-gap">
                  <Button className="btn-flex" onClick={handleReject}>
                    Decline
                  </Button>
                  <Button className="btn-flex" variant="primary" onClick={handleApprove}>
                    Approve
                  </Button>
                </div>
              </div>
            )}

          {connected && !activeSharer && !isSharing && !showMonitorPicker && (
            <div className="stage-overlay">
              <p>No one is sharing their screen</p>
              <p className="hint">Click "Share Screen" to get started</p>
            </div>
          )}

          {connected && !audioUnlocked && activeSharer && activeSharer !== participantId && (
            <button className="audio-unlock" onClick={unlockAudio}>
              Tap to hear audio
            </button>
          )}

          <Modal open={showQr} onClose={() => setShowQr(false)} title="Scan to view on mobile">
            <div className="qr-panel" style={{ border: "none", padding: 0, background: "transparent" }}>
              <div className="qr-code">
                <QRCodeSVG value={viewerUrl} size={200} />
              </div>
              <code className="caption muted">{viewerUrl}</code>
            </div>
          </Modal>

          <Modal
            open={showLeaveConfirm}
            onClose={() => setShowLeaveConfirm(false)}
            title="Leave session?"
          >
            <p className="muted small" style={{ textAlign: "center" }}>
              You'll stop sharing and disconnect from{" "}
              <code>{roomCode}</code>. This can't be undone.
            </p>
            <div className="row row-gap" style={{ width: "100%" }}>
              <Button className="btn-flex" onClick={() => setShowLeaveConfirm(false)}>
                Stay
              </Button>
              <Button className="btn-flex" variant="danger" onClick={handleConfirmLeave}>
                Leave
              </Button>
            </div>
          </Modal>

          {showMonitorPicker && (
            <div
              className="card"
              style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
            >
              <p className="card-title">Select Display</p>
              {outputs.length > 0 ? (
                <div className="option-list">
                  {outputs.map((o) => (
                    <label
                      key={o}
                      className={`option-item ${selectedOutput === o ? "option-item-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="output"
                        value={o}
                        checked={selectedOutput === o}
                        onChange={() => setSelectedOutput(o)}
                      />
                      {o}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="caption">No displays found</p>
              )}
              <div className="row row-gap">
                <Button className="btn-flex" onClick={handleCancelShare}>
                  Cancel
                </Button>
                <Button className="btn-flex" variant="primary" onClick={handleStartShare}>
                  Start Sharing
                </Button>
              </div>
            </div>
          )}
        </div>

        <aside className="aside">
          <div className="aside-header">
            <h3 className="aside-title">Participants</h3>
            <span className="badge">{participants.length}</span>
          </div>

          <ul className="participant-list">
            {participants.map((p) => (
              <li
                key={p.id}
                className={`participant ${p.id === participantId ? "participant-self" : ""}`}
              >
                <Avatar name={p.name} active={p.id === participantId} />
                <span className="participant-name">
                  {p.name}
                  {p.id === participantId && (
                    <span className="participant-self-label"> (you)</span>
                  )}
                </span>
                {activeSharer === p.id && <Badge variant="success">sharing</Badge>}
              </li>
            ))}
          </ul>

          <div className="status-bar">
            <span>{connected ? "Connected to server" : "Connecting..."}</span>
            <span className="row row-gap-sm">
              <span className={`status-dot ${activeSharer ? "status-dot-live" : ""}`} />
              {activeSharer ? "Sharing active" : "Idle"}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
