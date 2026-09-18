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
    await localParticipant.setMicrophoneEnabled(enabled);
    setMuted(!enabled);
  };

  return (
    <button onClick={toggle} style={{ padding: "0.5rem 1rem" }}>
      {muted ? "Unmute Mic" : "Mute Mic"}
    </button>
  );
}
