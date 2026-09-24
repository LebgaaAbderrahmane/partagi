# Security Model

Partagi is designed for **trusted small teams** (3–10 people), not for anonymous public broadcasting. This page describes what is enforced, what is not, and what you must do before exposing the app to the internet.

## Threat model (summary)

| Asset | Threat | Mitigation |
|-------|--------|------------|
| Screen/mic stream | Stranger connects to WS and watches | Room code required at WS handshake; per-room channels |
| Session control | Random joiner becomes sharer | Membership checks; approval required when room occupied |
| Room codes | Guessing / brute force | 12-char codes (~48 bits), normalized uppercase |
| Stale sessions | Memory leak / zombie rooms | 30-minute idle TTL + GC |
| Internet exposure | Unsolicited access via open ports | Firewall guidance; optional source-IP allowlists |

Out of scope for v0.2: TLS by default, end-to-end encryption of media, multi-user distributed session state, rate limiting, anti-DoS.

## What the app enforces

### 1. Room-scoped media

- Each session owns a **dedicated** `broadcast` channel.
- A WebSocket client must present `?room=<CODE>` during the HTTP upgrade (`accept_hdr_async`).
- Missing room, unknown room, or no channel → connection rejected before frames flow.
- Clients only receive frames for **their** room, not a global stream.

### 2. Session codes

- Length: **12** uppercase hex characters (`CODE_LEN = 12`).
- Generated from UUID v4 (`Uuid::new_v4().simple()`), uppercased.
- All commands normalize codes with `trim().to_uppercase()` so case does not matter on join.

Treat the code like a password for the duration of the session. Do not post public codes on open web pages if the host is internet-reachable.

### 3. Control-plane membership

Before mutating share state, commands call `ensure_member`:

- `request_screen_share`
- `approve_share_request`
- `reject_share_request`
- `cancel_share_request`
- `stop_sharing`

Participants must already be in the room’s participant list.

### 4. Approval flow (no silent takeover)

- Empty room → first `request_screen_share` claims sharer immediately.
- Occupied room → `needs_approval: true`; **only the current active sharer** can approve or reject.
- `takeover_share` was **removed** — there is no force-takeover API.

### 5. Session expiry

- `Session.last_activity` updates on join and on polled/share commands.
- Background task every 60s removes sessions idle longer than **30 minutes** and drops their broadcasters.

### 6. Bind failure behavior

Stream and viewer servers **log and exit the task** if ports cannot bind (no panic loop). Check logs if `:9001`/`:9002` are already in use.

## What the app does **not** do yet

| Gap | Notes |
|-----|-------|
| **TLS / WSS** | Plain `http` and `ws`. On the public internet, traffic can be sniffed. Put a TLS reverse proxy in front for sensitive content. |
| **Media encryption** | JPEG/PCM are not E2E-encrypted; anyone with a valid room URL who passes WS auth sees the stream. |
| **Strong authN** | Room code is the shared secret. No per-user accounts, passwords, or tokens. |
| **Viewer page auth** | Anyone who can reach `:9002` can load `viewer.html`. Actual frames still need `?room=` on WS. |
| **Rate limiting / DoS** | No connection caps or IP bans. |
| **CSP** | Tauri `csp` is currently `null` (disabled) in `tauri.conf.json`. |
| **Distributed sessions** | `AppState` is **per-process**. Multi-desktop participants do not share one global session map (mobile viewers against one host do). |

## Before enabling Remote mode

1. Read [Remote setup](remote.md).
2. Forward only **9001** and **9002**, TCP only.
3. Firewall with **source IP allowlists** when you know your teammates’ IPs.
4. Prefer a **DDNS hostname** over a raw IP if your address changes.
5. Confirm CGNAT is not in play (forward won’t work otherwise).
6. Consider TLS termination if the stream is sensitive.
7. Share the room code over a private channel (not public chat).

## Reporting issues

Security bugs: open a GitHub issue (mark **security**) or contact the maintainer privately if the issue is sensitive.

## Related

- [Architecture](architecture.md)
- [Remote setup](remote.md)
- [Troubleshooting](troubleshooting.md)
