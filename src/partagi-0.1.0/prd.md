Product Requirements Document
Partagi — Lightweight Screen Sharing for Small Teams

Status: v1 (LAN-only) Owner: Abdou

## 1. Summary

A lightweight desktop app that lets a small team (3-10 people) share their screen with each other in high resolution and low latency — without the overhead, compression artifacts, and lag of tools like Google Meet or Discord. Any participant can become the active screen-sharer during a session.

**v1 scope: LAN-only.** All participants must be on the same local network (office WiFi, co-working space). Remote/team-member support is a planned future phase.

## 2. Problem Statement

Existing tools (Google Meet, Discord, Zoom) route media through general-purpose infrastructure optimized for massive scale, which means:

- Screen share resolution and frame rate are aggressively compressed
- Latency is added by multi-hop relay/transcoding pipelines
- The tools are heavier than needed for a small team that just wants to show their screen

## 3. Goals

- Enable one-to-many screen sharing within a small team (3-10 participants) at high resolution with minimal latency
- Allow any participant to become the active sharer during a session
- Keep the app lightweight, fast to join (code), and free of unnecessary features
- **v1: LAN-only** — all participants on the same network

### Non-Goals (v1)

- Remote/cross-network sharing (requires STUN/TURN relay — planned for v2)
- Large-scale broadcasting (100+ viewers)
- Webcam video
- In-app text chat
- Screen recording
- Mobile clients as sharers (mobile viewers supported via web viewer)

## 4. Target Users

- Small software development teams (3-10 people) doing code reviews, pair debugging, or design walkthroughs
- Small startup/agency teams needing quick internal screen shares
- Freelancers/consultants sharing progress with a small client team

## 5. Core Features (v1)

### 5.1 Session / Room Management

- A participant creates a session and receives a room code
- Teammates join via the code using the same desktop app
- Sessions are ephemeral — no persistent workspace required
- User can set display name with "Remember me" option

### 5.2 Screen Sharing

- Any participant can click "Share Screen" to become the active sharer
- Only one active screen share at a time per session
- ~30fps via native Wayland capture (grim) over WebSocket
- Cursor included in capture
- Handoff request/approve flow between participants

### 5.3 Mobile Viewing

- Standalone web viewer served on port 9002
- Any device on the same LAN can view via browser (phone, tablet, laptop)
- Fullscreen support, auto-reconnect, responsive layout
- No app install required for viewers

### 5.4 Mic Audio

- Mic capture via ffmpeg PulseAudio backend (16kHz mono PCM)
- Streamed over same WebSocket with type prefix byte (`0x01` = video, `0x02` = audio)
- Mic toggle button in Session UI
- Desktop and mobile viewers play audio via Web Audio API
- Audio stops when participant leaves session

### 5.5 AI Meeting Summary (planned, not yet implemented)

- Audio transcribed during session (speech-to-text)
- On session end, transcript sent to LLM for summary + action items
- Summary shown in-app and exportable

## 6. Technical Architecture

### 6.1 Client

- Framework: Tauri 2 (Rust core + React web UI)
- Platform: Linux (Wayland) for v1 — macOS/Windows planned later

### 6.2 Screen Capture

- Tool: grim (Wayland-native screenshot tool)
- Format: JPEG, quality 40, 75% resolution scale
- Rate: ~30fps (capture as fast as grim allows, no artificial delay)
- Cursor included via grim -c flag

### 6.3 Streaming Transport

- WebSocket server (port 9001) — binary JPEG frames broadcast to all viewers
- tokio broadcast channel for fan-out to multiple viewers
- HTTP server (port 9002) — serves standalone viewer page via axum
- All servers bind to 0.0.0.0 for LAN access
- LAN IP auto-detected via UDP socket trick

### 6.4 Architecture Diagram

```
Desktop App (Sharer)
  grim --JPEG--> StreamFrame::Video --> broadcast channel --> WS server (:9001) --> all viewers
  ffmpeg --PCM--> StreamFrame::Audio --> broadcast channel --> WS server (:9001) --> all viewers
  Axum HTTP server (:9002) --> serves viewer.html

Viewer (Phone/Laptop)
  Browser opens http://<host-ip>:9002 --> connects to WS --> canvas (video) + Web Audio API (audio)
```

### 6.5 Bandwidth Notes

- ~81KB/frame at 30fps = ~2.4MB/s per viewer
- 5 viewers on WiFi = ~12MB/s upload — acceptable for modern APs
- Adaptive quality planned for v2 if needed

## 7. Roadmap

### Completed

- Phase 1: Core plumbing (session management, Tauri setup)
- Phase 2: Media (LiveKit-based, later replaced)
- Phase 3: Pivot to grim + WebSocket streaming
- Phase 4: Polish (dark theme, user ID, web viewer, FPS optimization, LAN access)
- Multi-monitor support (select display to capture)
- Share handoff (takeover sharing)
- Mic audio over WebSocket
- Platform support (macOS + Windows backends via xcap + cpal)
- .deb packaging for Linux

### Next

- AppImage packaging (requires linuxdeploy)
- .dmg / .msi / .nsis installers for macOS/Windows

### Future (post-v1)

- Remote/cross-network support (STUN/TURN relay)
- AI meeting summary (STT + LLM)
- Real-time translation
- Session recap search
