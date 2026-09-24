# Features Reference

Complete user-facing behavior of Partagi (v0.2).

## Sessions

| Action | How |
|--------|-----|
| Create | Home → **New Session** → 12-character code |
| Join | Home → enter code → **Join** (or click a **Recent** chip) |
| Recent codes | Last 5 codes stored in `localStorage` (`partagi-recent-sessions`) |
| Display name | Home field; **Remember me** persists name + participant id |
| Leave | Header **Leave** or **Shift+Q** → confirm modal |

Codes are case-insensitive on input (normalized to uppercase).

## Network modes

Home → expand **Network**.

| Mode | URLs use | Use when |
|------|----------|----------|
| **LAN** (default) | Private IP (e.g. `192.168.1.66`) | Same office/home WiFi |
| **Remote** | Public IP or hostname you enter | Teammates elsewhere; requires port forward |

Remote panel fields:

- **Public IP or hostname** — used in stream URL, viewer link, QR
- **Detect** — fetches public IP via `api.ipify.org` (only when you click)
- **LAN IP** — target for router port-forward rules
- Link to [Remote setup guide](remote.md)

Ports: **9001** (WebSocket), **9002** (HTTP viewer).

## Screen sharing

1. **Share Screen** (or **S**):
   - Empty room → monitor picker opens immediately.
   - Someone else sharing → request sent; current sharer sees Approve / Decline.
   - You are sharer → **Stop Sharing**.
2. Pick a display → **Start Sharing**.
3. Only one active sharer per room.

Quality dropdown (Low / Balanced / High) changes scale, JPEG quality, and frame interval. Changing quality while sharing restarts the capture with the new preset.

## Microphone

- **Mic On/Off** (or **M**).
- Linux: `ffmpeg` PulseAudio; macOS/Windows: `cpal`.
- Level meter appears while mic is on (green → yellow → red).
- Mobile viewers may need **Tap to hear audio** once (browser autoplay policy).

## Viewer link & QR

Session header shows:

- Room code + **Copy Code**
- Viewer URL + **Copy Link**
- **QR** — scannable viewer URL for phones
- **Viewer count** (connected WebSocket clients)

Opening `http://<host>:9002/?room=CODE` loads the standalone viewer (canvas + fullscreen + reconnect).

## Approval protocol

```
Room empty ──request──► you become sharer (no wait)
Room occupied ──request──► pending_share_request
                              │
              current sharer ─┼─ Approve ─► you become sharer
                              └─ Decline ─► request cleared
Requester can Cancel while waiting
```

There is **no force takeover**.

## Sidebar

- Participant list with avatars (initials) and **sharing** badge.
- Collapse/expand toggle (persisted: `partagi-sidebar-collapsed`).
- Status: connection + whether sharing is active.

## Stats overlay

Header **Stats** (persisted: `partagi-show-stats`):

| Row | Meaning |
|-----|---------|
| FPS | Video frames received in the last second |
| Resolution | Canvas pixel dimensions |
| Viewers | Connected WS clients |
| Quality | Current quality preset |

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `S` | Toggle share flow |
| `M` | Toggle mic |
| `Shift+Q` | Leave confirm |
| `Esc` | Close leave modal (and other modals) |

Shortcuts are disabled while typing in inputs and while modals/pickers are open.

## Leave confirmation

**Leave** / `Shift+Q` opens a modal (Stay / Leave). Leaving stops stream and mic, closes WS, and notifies the backend.

## Quality presets

| Preset | Scale | JPEG | Frame interval | Approx. use |
|--------|-------|------|----------------|-------------|
| Low | 50% | 25 | 100 ms (~10 fps) | Weak uplink / remote |
| Balanced | 75% | 40 | 50 ms (~20 fps) | Default |
| High | 100% | 60 | 33 ms (~30 fps) | Strong LAN |

## Persistence keys (localStorage)

| Key | Content |
|-----|---------|
| `partagi-participant-id` | Stable participant id (Remember me) |
| `partagi-display-name` | Display name |
| `partagi-recent-sessions` | JSON array of up to 5 codes |
| `partagi-sidebar-collapsed` | `1` / `0` |
| `partagi-show-stats` | `1` / `0` |

Network mode lives in the Rust process (`NetworkConfig`), not localStorage — re-select Remote after app restart if needed.

## Related

- [Architecture](architecture.md)
- [Remote setup](remote.md)
- [Troubleshooting](troubleshooting.md)
