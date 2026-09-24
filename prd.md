Product Requirements Document
Partagi — Lightweight Screen Sharing for Small Teams

Status: v1.1 (LAN + remote port-forward mode) Owner: Abdou

## 1. Summary

A lightweight desktop app that lets a small team (3-10 people) share their screen with each other in high resolution and low latency — without the overhead, compression artifacts, and lag of tools like Google Meet or Discord. The current sharer approves handoffs when the room is already occupied.

**Networking:** LAN mode is the default. **Remote mode** exposes the same servers via user-managed port forwarding (9001/9002) — no Partagi-operated cloud relay. Full guide: [docs/remote.md](docs/remote.md).

## 2. Problem Statement

Existing tools (Google Meet, Discord, Zoom) route media through general-purpose infrastructure optimized for massive scale, which means:

- Screen share resolution and frame rate are aggressively compressed
- Latency is added by multi-hop relay/transcoding pipelines
- The tools are heavier than needed for a small team that just wants to show their screen

## 3. Goals

- Enable one-to-many screen sharing within a small team (3-10 participants) at high resolution with minimal latency
- Handoff via request/approve when a room is occupied (no silent force-takeover)
- Keep the app lightweight, fast to join (code), and free of unnecessary features
- **LAN-first**, with optional **remote port-forward** for off-network teammates

### Non-Goals

- Built-in STUN/TURN or hosted relay (user may bring their own tunnel/VPN)
- Large-scale broadcasting (100+ viewers)
- Webcam video
- In-app text chat
- Screen recording
- Mobile clients as sharers (mobile viewers supported via web viewer)
- AI meeting summary (deferred)

## 4. Target Users

- Small software development teams (3-10 people) doing code reviews, pair debugging, or design walkthroughs
- Small startup/agency teams needing quick internal screen shares
- Freelancers/consultants sharing progress with a small client team

## 5. Core Features

### 5.1 Session / Room Management

- A participant creates a session and receives a **12-character** room code
- Teammates join via the code using the same desktop app
- Sessions are ephemeral — in-memory, **30-minute idle TTL**, no persistent workspace
- User can set display name with "Remember me" option
- Recent session codes stored locally for quick rejoin

### 5.2 Screen Sharing

- First participant into an empty room becomes sharer immediately
- Occupied rooms: request → **current sharer approves or declines**
- Only one active screen share at a time per session
- Quality presets: Low / Balanced / High (scale, JPEG quality, frame interval)
- Multi-monitor selection
- Membership checks on all share-control commands

### 5.3 Mobile Viewing

- Standalone web viewer served on port 9002 with `?room=` parameter
- Any device that can reach the host can view via browser
- Fullscreen support, auto-reconnect, responsive layout
- QR code + copyable viewer link from the session header
- No app install required for viewers

### 5.4 Mic Audio

- Mic capture via ffmpeg PulseAudio (Linux) or cpal (macOS/Windows), 16 kHz mono PCM
- Streamed over same WebSocket with type prefix byte (`0x01` = video, `0x02` = audio)
- Mic toggle + live RMS level meter in Session UI
- Desktop and mobile viewers play audio via Web Audio API (mobile requires one user gesture)
- Audio stops when participant leaves session

### 5.5 Networking modes

- **LAN** — URLs use auto-detected private IP
- **Remote** — URLs use user-configured public IP/hostname; requires port forward of 9001/9002
- Documented in [docs/remote.md](docs/remote.md); security expectations in [docs/security.md](docs/security.md)

### 5.6 Security hardening (v0.2)

- Per-room media channels (no global fan-out)
- WebSocket handshake requires valid `?room=`
- Uppercase-normalized 12-char codes
- Session idle expiry + GC
- `takeover_share` removed

### 5.7 AI Meeting Summary (planned, not yet implemented)

- Audio transcribed during session (speech-to-text)
- On session end, transcript sent to LLM for summary + action items
- Summary shown in-app and exportable

## 6. Technical Architecture

### 6.1 Client

- Framework: Tauri 2 (Rust core + React web UI)
- Platforms: Linux (Wayland), macOS, Windows

### 6.2 Screen Capture

- Linux: grim (Wayland); macOS/Windows: xcap + JPEG encode
- Quality presets control scale, JPEG quality, and frame interval
- Cursor included where the backend supports it

### 6.3 Streaming Transport

- WebSocket server (port 9001) — binary frames, **room-scoped**, `?room=` required at upgrade
- tokio broadcast channel **per session**
- HTTP server (port 9002) — serves standalone viewer page via axum
- All servers bind to 0.0.0.0
- Host for URLs: LAN IP or Remote public host (`NetworkConfig`)
- Docs: [docs/architecture.md](docs/architecture.md)

### 6.4 Architecture Diagram

```
Desktop App (Sharer)
  grim/xcap --JPEG--> StreamFrame::Video --> room broadcast --> WS (:9001) --> room viewers
  ffmpeg/cpal --PCM--> StreamFrame::Audio --> room broadcast --> WS (:9001) --> room viewers
  Axum HTTP (:9002) --> serves viewer.html

Viewer (Phone/Laptop)
  Browser opens http://<host>:9002/?room=CODE --> WS with room --> canvas + Web Audio
```

### 6.5 Bandwidth Notes

- ~81KB/frame at 30fps = ~2.4MB/s per viewer (High; lower with Balanced/Low)
- 5 viewers on WiFi = ~12MB/s upload — acceptable for modern APs
- Remote mode: same math against home uplink — prefer Low quality if limited

## 7. Documentation

Detailed docs live under [docs/](docs/): architecture, features, remote setup, security, development, testing, troubleshooting.

## 8. Roadmap

### Completed

- Phase 1: Core plumbing (session management, Tauri setup)
- Phase 2: Media (LiveKit-based, later replaced)
- Phase 3: Pivot to grim + WebSocket streaming
- Phase 4: Polish (dark theme, user ID, web viewer, FPS optimization, LAN access)
- Multi-monitor support (select display to capture)
- Share request/approval handoff (force takeover removed)
- Mic audio over WebSocket + level meter
- Platform support (macOS + Windows backends via xcap + cpal)
- .deb packaging for Linux (+ .rpm, .dmg, .exe, .msi via CI)
- Display names + avatars
- Quality selector
- Design system (UI kit + CSS classes)
- Keyboard shortcuts + leave confirmation
- Recent sessions, sidebar collapse, stats overlay, empty states
- Security hardening (per-room media, WS room auth, longer codes, TTL)
- Remote/port-forward mode (LAN/Remote toggle, public host URLs)
- Full documentation set (docs/)

### Next

- Automated test suites (Vitest + cargo test) and CI wiring
- Reconnect UX + error-surface polish
- Accessibility pass (focus trap, contrast, labels)
- AppImage packaging (requires linuxdeploy)
- v0.2.0 release

### Future (post-v0.2)

- Optional built-in tunnel helpers (user-brings-account)
- AI meeting summary (STT + LLM)
- Real-time translation
- Session recap search
