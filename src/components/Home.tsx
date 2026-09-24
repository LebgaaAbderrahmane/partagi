import { useState, useEffect } from "react";
import {
  createSession,
  getNetworkInfo,
  setNetworkMode,
  type NetworkInfo,
  type NetworkMode,
} from "../lib/tauri-commands";
import { Button } from "./ui";
import { History, Globe, Wifi, ExternalLink } from "lucide-react";

interface HomeProps {
  onJoinSession: (
    code: string,
    participantId: string,
    displayName: string,
  ) => void;
}

const STORAGE_KEY = "partagi-participant-id";
const NAME_KEY = "partagi-display-name";
const RECENT_KEY = "partagi-recent-sessions";

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(code: string) {
  const codeUpper = code.toUpperCase();
  const next = [codeUpper, ...loadRecent().filter((c) => c !== codeUpper)].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export default function Home({ onJoinSession }: HomeProps) {
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem(NAME_KEY) || "",
  );
  const [participantId] = useState(
    () => localStorage.getItem(STORAGE_KEY) || crypto.randomUUID().slice(0, 12),
  );
  const [rememberMe, setRememberMe] = useState(
    () => localStorage.getItem(STORAGE_KEY) !== null,
  );
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [publicHost, setPublicHost] = useState("");
  const [showNetwork, setShowNetwork] = useState(false);
  const [detectingIp, setDetectingIp] = useState(false);

  useEffect(() => {
    getNetworkInfo()
      .then((info) => {
        setNetwork(info);
        setPublicHost(info.public_host || "");
        if (info.mode === "remote") setShowNetwork(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (rememberMe) {
      localStorage.setItem(STORAGE_KEY, participantId);
      localStorage.setItem(NAME_KEY, displayName);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(NAME_KEY);
    }
  }, [rememberMe, participantId, displayName]);

  const getName = () => displayName.trim() || "Guest";

  const applyNetwork = async (mode: NetworkMode, host: string) => {
    try {
      const info = await setNetworkMode(mode, host);
      setNetwork(info);
      setPublicHost(info.public_host || host);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleModeChange = async (mode: NetworkMode) => {
    await applyNetwork(mode, publicHost);
  };

  const handlePublicHostBlur = async () => {
    if (network && network.mode === "remote") {
      await applyNetwork("remote", publicHost);
    }
  };

  const handleDetectIp = async () => {
    setDetectingIp(true);
    setError(null);
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = (await res.json()) as { ip?: string };
      if (data.ip) {
        setPublicHost(data.ip);
        await applyNetwork("remote", data.ip);
      } else {
        setError("Could not detect public IP");
      }
    } catch {
      setError("Could not detect public IP — enter it manually");
    } finally {
      setDetectingIp(false);
    }
  };

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const name = getName();
      const res = await createSession(participantId, name);
      saveRecent(res.code);
      setRecent(loadRecent());
      onJoinSession(res.code, participantId, name);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setLoading(true);
    setError(null);
    try {
      saveRecent(code);
      setRecent(loadRecent());
      onJoinSession(code, participantId, getName());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRecent = (code: string) => {
    setJoinCode(code);
    setLoading(true);
    setError(null);
    onJoinSession(code, participantId, getName());
  };

  const mode = network?.mode ?? "lan";
  const remoteReady = network?.remote_ready ?? false;

  return (
    <div className="home">
      <div className="home-brand">
        <h1>Partagi</h1>
        <p>Lightweight screen sharing for small teams</p>
      </div>

      <div className="home-card">
        <div className="field">
          <label htmlFor="name">Your Name</label>
          <input
            id="name"
            type="text"
            placeholder="Enter your name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Remember me
          </label>
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? "Creating..." : "New Session"}
        </Button>

        <div className="divider">
          <span>or</span>
        </div>

        <div className="row row-gap">
          <input
            className="room-input"
            type="text"
            placeholder="Enter room code"
            aria-label="Room code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
          <Button onClick={handleJoin} disabled={loading || !joinCode.trim()}>
            Join
          </Button>
        </div>

        <div className="network-section">
          <button
            type="button"
            className="network-toggle"
            onClick={() => setShowNetwork((v) => !v)}
            aria-expanded={showNetwork}
          >
            <span className="row row-gap-sm">
              {mode === "remote" ? <Globe size={14} /> : <Wifi size={14} />}
              Network: {mode === "remote" ? "Remote" : "LAN"}
              {mode === "remote" && !remoteReady && (
                <span className="badge badge-warning">setup needed</span>
              )}
            </span>
            <span className="network-chevron">{showNetwork ? "▾" : "▸"}</span>
          </button>

          {showNetwork && (
            <div className="network-panel">
              <div className="network-modes" role="radiogroup" aria-label="Network mode">
                <label className={`network-mode ${mode === "lan" ? "network-mode-active" : ""}`}>
                  <input
                    type="radio"
                    name="network-mode"
                    value="lan"
                    checked={mode === "lan"}
                    onChange={() => handleModeChange("lan")}
                  />
                  <span>
                    <strong>LAN</strong>
                    <span className="caption muted">Same local network only</span>
                  </span>
                </label>
                <label className={`network-mode ${mode === "remote" ? "network-mode-active" : ""}`}>
                  <input
                    type="radio"
                    name="network-mode"
                    value="remote"
                    checked={mode === "remote"}
                    onChange={() => handleModeChange("remote")}
                  />
                  <span>
                    <strong>Remote</strong>
                    <span className="caption muted">Over the internet via port forwarding</span>
                  </span>
                </label>
              </div>

              {mode === "remote" && (
                <div className="field">
                  <label htmlFor="public-host">Public IP or hostname</label>
                  <div className="row row-gap">
                    <input
                      id="public-host"
                      type="text"
                      placeholder="e.g. 203.0.113.10 or home.example.com"
                      value={publicHost}
                      onChange={(e) => setPublicHost(e.target.value)}
                      onBlur={handlePublicHostBlur}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handlePublicHostBlur()
                      }
                    />
                    <Button
                      size="sm"
                      onClick={handleDetectIp}
                      disabled={detectingIp}
                    >
                      {detectingIp ? "Detecting…" : "Detect"}
                    </Button>
                  </div>
                  <p className="caption muted network-help">
                    Forward router ports <code>9001</code> (stream) and{" "}
                    <code>9002</code> (viewer) to this machine. Links and QR codes
                    will use this host so teammates can join from anywhere.
                    <a
                      className="network-docs"
                      href="https://github.com/LebgaaAbderrahmane/partagi/blob/main/docs/remote.md"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Remote setup guide <ExternalLink size={11} />
                    </a>
                  </p>
                  {network?.lan_ip && (
                    <p className="caption muted">
                      This machine LAN IP: <code>{network.lan_ip}</code>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {recent.length > 0 && (
        <div className="recent-sessions">
          <div className="section-label row row-gap-sm">
            <History size={12} />
            Recent
          </div>
          <div className="recent-list">
            {recent.map((code) => (
              <Button
                key={code}
                size="sm"
                className="recent-chip"
                onClick={() => handleJoinRecent(code)}
                disabled={loading}
              >
                {code}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
