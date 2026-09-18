import { useState } from "react";
import { LocalParticipant } from "livekit-client";

interface MicToggleProps {
  localParticipant: LocalParticipant | null;
}

export default function MicToggle({ localParticipant }: MicToggleProps) {
  const [muted, setMuted] = useState(false);

  const toggle = async () => {
    if (!localParticipant) return;
    const enabled = !muted;

    if (enabled) {
      await localParticipant.setMicrophoneEnabled(true, {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
      });
    } else {
      await localParticipant.setMicrophoneEnabled(false);
    }

    setMuted(!enabled);
  };

  return (
    <button onClick={toggle} disabled={!localParticipant}>
      {muted ? "Unmute" : "Mute"}
    </button>
  );
}
