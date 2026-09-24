# Troubleshooting

Quick fixes for common Partagi issues. See also [Remote setup](remote.md) for port-forward specifics.

## App won’t start / ports busy

**Symptoms:** black window, or logs show `Failed to bind stream server` / `Failed to bind viewer server`.

**Cause:** Another process holds **9001** or **9002**.

```bash
# Linux
ss -tlnp | grep -E '9001|9002'
# or
lsof -i :9001 -i :9002
```

Free the port or stop the conflicting app. Servers log and exit the task rather than panicking the whole process — the UI may still open but streaming will fail until ports are free.

## Cannot create / join session

| Check | Detail |
|-------|--------|
| Code | Must match an existing session (12 chars). Typing is case-insensitive. |
| Same app instance | Sessions live in **that process**. The host app must still be running. |
| Expired | Idle sessions expire after **30 minutes**. Create a new one. |
| “Session not found” | Wrong code, host already left, or TTL hit. |

## Desktop shows “Connecting to stream server…”

1. Confirm host is on and Partagi is open.
2. Same LAN → host LAN IP reachable? `ping <host-ip>`.
3. Remote → ports 9001/9002 forwarded and host firewall open ([remote.md](remote.md)).
4. URL must include `?room=CODE` (automatic in-app; check manual WS URLs).
5. Another network/VPN isolating machines.

## Mobile viewer blank / stuck Connecting

1. Open the full viewer URL including `?room=…` (QR/copy link already does this).
2. `curl http://<host>:9002/health` → should return `ok`.
3. WebSocket to `:9001` must be allowed (same ports as above).
4. Wrong room → server rejects upgrade; double-check code.
5. iOS/Android private Wi-Fi permissions (some networks isolate clients).

## No video but connected

- Nobody sharing yet → stage shows idle overlay.
- Capture failed: Linux needs **grim** (Wayland) and correct output name in picker.
- Quality too high for uplink → try **Low**.
- Multiple monitors: pick the right output.

```bash
grim -c -t jpeg -q 40 -s 0.75 /tmp/test.jpg && echo ok
```

## No audio

| Side | Fix |
|------|-----|
| Sharer | Mic button on; mic meter should move when you speak |
| Linux | `ffmpeg` installed; PulseAudio/PipeWire default source works (`pactl info`) |
| Mobile viewer | Tap **Tap to hear audio** once (autoplay policy) |
| Desktop viewer | AudioContext unlock / refresh page |

## Share request stuck “Waiting for approval”

- Current sharer must Approve/Decline in their UI.
- If sharer app crashed, room may still list them — stop sharing on host or create a new session.
- Requester can **Cancel Request**.

## Remote / port forwarding

See full guide: [remote.md](remote.md). Common causes:

1. **Forward rule points at wrong LAN IP** (DHCP changed the host IP).
2. **Host firewall** not allowing 9001/9002 from WAN.
3. **CGNAT** — you have no true public IPv4; forwards cannot work. Use VPN mesh or a tunnel.
4. **Double NAT** — forward on both routers or bridge the modem.
5. **Remote mode not set** in Partagi — links still show `192.168.x.x`.
6. **Detect failed** (no internet or blocked) — type the public IP/DDNS manually.

Verify from outside the LAN:

```bash
curl -s http://YOUR_PUBLIC_IP:9002/health   # ok
```

## High CPU / low FPS

- Lower quality (Low/Balanced).
- Close other capture tools (OBS, screenshare in Zoom, etc.).
- On Wayland, ensure grim isn’t failing every frame (check terminal logs).

## Arch package / makepkg

- Build artifacts (`pkg/`, `*.tar.gz`) are gitignored; clean with `makepkg -C` if needed.
- Prefer extracting the official `.deb` if disk is tight (source builds need ~2 GB).
- `PKGBUILD` uses `npm install` + `npx tauri build`.

## macOS / Windows capture

- **xcap** screen-recording permission: grant in System Settings (macOS) / Privacy settings (Windows).
- First share may prompt for permission — allow and retry.

## Logs

- Desktop: run from terminal (`partagi` or `pnpm tauri dev`) and read stdout:
  - `[stream] …`
  - `[viewer] …`
  - `[session] Expired …`
- CI/build failures: GitHub Actions **Build verification** job.

## Still stuck?

1. Note OS, install method, LAN vs Remote, exact error string.
2. Check [architecture.md](architecture.md) for how the piece you’re debugging fits.
3. Open a GitHub issue with repro steps.
