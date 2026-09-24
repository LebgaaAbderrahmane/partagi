# Architecture

Partagi is a Tauri 2 desktop app (Rust core + React UI) that captures the screen and mic on one machine and fans frames out over local (or port-forwarded) WebSocket connections.

## High-level diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Sharer / Host desktop                   │
│                                                                  │
│  React UI (Session.tsx)                                          │
│    │  Tauri IPC (tauri-commands.ts)                              │
│    ▼                                                             │
│  main.rs  ── sessions HashMap (per-room state)                   │
│         ── broadcasters HashMap (per-room broadcast channels)    │
│         ── NetworkConfig (LAN | Remote + public host)            │
│    │                                                             │
│    ├─► ScreenCapture (grim / xcap)  ── JPEG ──► StreamFrame::Video│
│    ├─► MicCapture (ffmpeg / cpal)   ── PCM  ──► StreamFrame::Audio│
│    │                                                             │
│    ├─► WS server  :9001   (room-scoped fan-out, ?room=CODE)      │
│    └─► HTTP server :9002  (axum → embedded viewer.html)          │
└─────────────────────────────────────────────────────────────────┘
          │ WS binary frames                    │ HTTP
          ▼                                     ▼
   Desktop viewers                       Mobile / any browser
   (canvas + Web Audio)                  (viewer.html canvas + Web Audio)
```

## Process layout

| Piece | Tech | Role |
|-------|------|------|
| Shell | Tauri 2 | Window, IPC, plugins (`shell` for open) |
| Capture | grim (Linux), xcap (macOS/Windows) | Screen → JPEG buffers |
| Mic | ffmpeg Pulse (Linux), cpal (macOS/Windows) | Mic → 16 kHz mono PCM |
| Fan-out | `tokio::sync::broadcast` | One channel **per room** |
| Media transport | `tokio-tungstenite` on **:9001** | Binary frames to viewers |
| Viewer page | `axum` on **:9002** | Serves `viewer.html` + `/health` |
| Frontend | React 19 + Vite | Home, Session, UI kit |

## Media plane

1. Capture tasks send `StreamFrame::{Video,Audio}` into the room’s `broadcast::Sender`.
2. Each accepted WebSocket client **subscribes** only after validating `?room=<CODE>` exists.
3. On the wire, each binary message is:

   | First byte | Payload |
   |------------|---------|
   | `0x01` | JPEG image bytes |
   | `0x02` | little-endian `i16` PCM (mono, 16 kHz) |

4. Clients decode JPEG to `<canvas>`; audio is queued into `AudioContext` buffers (after a user gesture unlocks autoplay).

There is **no re-encoding relay** — the host captures once and fans out. Quality (scale, JPEG quality, FPS) is chosen at capture time.

## Control plane (Tauri commands)

All session mutations go through Tauri IPC into `AppState`:

| Command | Purpose |
|---------|---------|
| `create_session` | New 12-char code, empty room + broadcaster |
| `join_session` | Add participant, return `stream_url` for mode’s host |
| `leave_session` | Remove participant; delete room when empty |
| `get_participants` / `get_active_sharer` / `get_pending_share_request` | Polled every 2s by UI |
| `request_screen_share` / `approve_*` / `reject_*` / `cancel_*` | Handoff protocol |
| `stop_sharing` | Clear active sharer |
| `start_stream` / `stop_stream` | Capture on/off for a room |
| `start_mic` / `stop_mic` | Mic on/off for a room |
| `get_network_info` / `set_network_mode` | LAN vs Remote host selection |
| `list_outputs` | Monitors (hyprctl on Linux, xcap elsewhere) |
| `get_viewer_count` | Connected WS clients (global) |

`takeover_share` was **removed** — force-takeover is out of scope; occupied rooms require approval.

## Session lifecycle

```
create_session ──► participants join ──► optional share/mic
                      │
                      ├─ leave_session (empty) ──► room + broadcaster removed
                      └─ idle 30 min (GC every 60s) ──► expired, broadcaster removed
```

- Codes are **uppercase**, 12 hex chars (~48 bits). Lookups normalize input.
- `last_activity` is touched on join/poll/share ops; GC task in `main.rs` enforces `SESSION_TTL`.

## Network modes

```rust
enum NetworkMode { Lan, Remote }
```

- **Lan** — URLs use `get_local_ip()` (UDP connect trick to 8.8.8.8).
- **Remote** — URLs use configured `public_host` (IP or DDNS name).

`stream_url` returned by `join_session` looks like:

```
ws://<host>:9001?room=ABCD1234EF56
```

Viewer URL (derived in `Session.tsx`):

```
http://<host>:9002/?room=ABCD1234EF56
```

`viewer.html` reads `room` from `location.search` and reconnects to `ws://<hostname>:9001?room=…`.

## Frontend structure

```
src/
  App.tsx              view switch (home | session), ToastProvider root
  components/
    Home.tsx           name, create/join, recent codes, network panel
    Session.tsx        header controls, WS client, overlays, sidebar, modals
    ui/                Button, Modal, Toast, Avatar, Badge
  lib/tauri-commands.ts  typed invoke wrappers
  index.css            design tokens + semantic classes
```

## Ports

| Port | Bind | Protocol |
|------|------|----------|
| 9001 | 0.0.0.0 | WebSocket (room required) |
| 9002 | 0.0.0.0 | HTTP (viewer HTML + `/health`) |

## Platform capture matrix

| OS | Screen | Mic |
|----|--------|-----|
| Linux (Wayland) | `grim` JPEG to temp file, read back | `ffmpeg -f pulse` |
| macOS | `xcap` → resize → JPEG encode | `cpal` |
| Windows | `xcap` → resize → JPEG encode | `cpal` |

Quality presets (`stream/common.rs`):

| Quality | Scale | JPEG | Interval |
|---------|-------|------|----------|
| Low | 0.5 | 25 | 100 ms |
| Balanced (default) | 0.75 | 40 | 50 ms |
| High | 1.0 | 60 | 33 ms |

## Related

- [Security](security.md)
- [Remote setup](remote.md)
- [Features](features.md)
- [Development](development.md)
