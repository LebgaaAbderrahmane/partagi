import { useState, useEffect } from "react";
import {
  approveShareRequest,
  rejectShareRequest,
  takeoverShare,
} from "../lib/tauri-commands";

interface HandoffModalProps {
  roomCode: string;
  participantId: string;
  requesterId: string;
  isCurrentSharer: boolean;
  onHandoffComplete: () => void;
  onDismiss: () => void;
}

const TIMEOUT_SECONDS = 5;

export default function HandoffModal({
  roomCode,
  participantId,
  requesterId,
  isCurrentSharer,
  onHandoffComplete,
  onDismiss,
}: HandoffModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS);

  useEffect(() => {
    if (!isCurrentSharer) return;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleApprove();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isCurrentSharer]);

  const handleApprove = async () => {
    try {
      await approveShareRequest(roomCode, participantId);
      onHandoffComplete();
    } catch (e) {
      console.error("Failed to approve:", e);
    }
  };

  const handleReject = async () => {
    try {
      await rejectShareRequest(roomCode, participantId);
      onDismiss();
    } catch (e) {
      console.error("Failed to reject:", e);
    }
  };

  const handleTakeover = async () => {
    try {
      await takeoverShare(roomCode, participantId);
      onHandoffComplete();
    } catch (e) {
      console.error("Failed to takeover:", e);
    }
  };

  if (isCurrentSharer) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>
              ?
            </div>
            <div>
              <p style={{ fontWeight: 600 }}>Share Request</p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{requesterId.slice(0, 8)} wants to share</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem", background: "var(--bg)", borderRadius: "var(--radius)", marginBottom: "0.5rem" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: "0.85rem" }}>Auto-approving in {secondsLeft}s</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="primary" onClick={handleApprove} style={{ flex: 1 }}>Allow Now</button>
            <button className="danger" onClick={handleReject} style={{ flex: 1 }}>Reject</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ textAlign: "center", padding: "1rem 0" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.75rem", fontSize: "1.25rem" }}>
            ...
          </div>
          <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Waiting for response</p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Requesting screen share from {requesterId.slice(0, 8)}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={handleTakeover} style={{ flex: 1 }}>Takeover</button>
          <button onClick={onDismiss} style={{ flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  backdropFilter: "blur(4px)",
};

const modalStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  padding: "1.25rem",
  borderRadius: "var(--radius-lg)",
  maxWidth: 360,
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};
