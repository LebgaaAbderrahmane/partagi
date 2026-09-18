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
          <p>
            <strong>{requesterId.slice(0, 8)}</strong> wants to share their
            screen.
          </p>
          <p>Auto-approving in {secondsLeft}s...</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={handleApprove}>Allow Now</button>
            <button onClick={handleReject}>Reject</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <p>Waiting for <strong>{requesterId.slice(0, 8)}</strong> to respond...</p>
        <button onClick={handleTakeover}>Takeover Anyway</button>
        <button onClick={onDismiss} style={{ marginLeft: "0.5rem" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "white",
  padding: "1.5rem",
  borderRadius: 8,
  maxWidth: 400,
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};
