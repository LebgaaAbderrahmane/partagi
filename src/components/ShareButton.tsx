import { LocalParticipant } from "livekit-client";
import {
  requestScreenShare,
  stopSharing,
} from "../lib/tauri-commands";

interface ShareButtonProps {
  localParticipant: LocalParticipant | null;
  roomCode: string;
  participantId: string;
  isSharing: boolean;
  onShareStarted: () => void;
  onShareStopped: () => void;
}

export default function ShareButton({
  localParticipant,
  roomCode,
  participantId,
  isSharing,
  onShareStarted,
  onShareStopped,
}: ShareButtonProps) {

  const handleShare = async () => {
    if (!localParticipant) return;

    if (isSharing) {
      localParticipant.setScreenShareEnabled(false);
      await stopSharing(roomCode, participantId);
      onShareStopped();
      return;
    }

    try {
      const result = await requestScreenShare(roomCode, participantId);

      if (result.needs_approval) {
        return;
      }

      await localParticipant.setScreenShareEnabled(true);
      onShareStarted();
    } catch (e) {
      console.error("Failed to start screen share:", e);
    }
  };

  return (
    <button
      onClick={handleShare}
      disabled={!localParticipant}
      style={{
        padding: "0.5rem 1rem",
        background: isSharing ? "#ef4444" : undefined,
        color: isSharing ? "white" : undefined,
      }}
    >
      {isSharing ? "Stop Sharing" : "Share Screen"}
    </button>
  );
}
