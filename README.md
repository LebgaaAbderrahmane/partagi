# Partagi

Lightweight LAN screen sharing for small teams. No cloud, no accounts, no lag.

Share your screen with 3-10 people on the same network at ~30fps with mic audio. Any participant can take over as the sharer. Mobile devices join via a web browser — no app install needed.

## Why

Existing tools (Meet, Discord, Zoom) compress aggressively and add latency through relay servers. Partagi runs entirely on your local network — direct WebSocket streaming with no middleman.

## Features

- **~30fps screen sharing** via native capture (grim on Linux, xcap on macOS/Windows)
- **Mic audio** streamed alongside video
- **Multi-monitor** selection — pick which display to share
- **Takeover sharing** — any participant can take over
- **Mobile web viewer** — open `http://<host-ip>:9002` on any device
- **Zero setup** — create a session, share the 8-character code, done
- **Cross-platform** — Linux, macOS, Windows

## Installation

### Arch Linux (makepkg)

```bash
git clone https://github.com/LebgaaAbderrahmane/partagi.git
cd partagi
makepkg -si
```

### Fedora (.rpm)

Download `Partagi_0.1.0-1.x86_64.rpm` from [Releases](https://github.com/LebgaaAbderrahmane/partagi/releases) then:

```bash
sudo rpm -i Partagi_0.1.0-1.x86_64.rpm
```

### Debian / Ubuntu (.deb)

Download `Partagi_0.1.0_amd64.deb` from [Releases](https://github.com/LebgaaAbderrahmane/partagi/releases) then:

```bash
sudo dpkg -i Partagi_0.1.0_amd64.deb
```

### macOS

Download `Partagi_0.1.0_aarch64.dmg` from [Releases](https://github.com/LebgaaAbderrahmane/partagi/releases), open the .dmg, and drag Partagi to Applications.

### Windows

Download `Partagi_0.1.0_x64-setup.exe` from [Releases](https://github.com/LebgaaAbderrahmane/partagi/releases) and run the installer.

### Runtime dependencies (Linux)

- `libwebkit2gtk-4.1-0` / `webkit2gtk-4.1`
- `gtk3`
- `ffmpeg` (mic audio)
- `grim` (Wayland screen capture)

## Build from Source

### Prerequisites

- [Rust](https://rustup.rs/)
- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/)
- Linux: `grim`, `ffmpeg`, `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`
- macOS: Xcode Command Line Tools
- Windows: WebView2, Visual Studio Build Tools

### Setup

```bash
git clone https://github.com/LebgaaAbderrahmane/partagi.git
cd partagi
pnpm install
```

### Development

```bash
pnpm tauri dev
```

### Production Build

```bash
pnpm tauri build
```

Output: `src-tauri/target/release/bundle/` contains `.deb`, `.rpm`, `.dmg`, `.msi`, or `.exe` depending on platform.

## Usage

1. Open Partagi and enter your display name
2. Click **Create Session** — you get an 8-character room code
3. Share the code with your team (they join via the same app)
4. Click **Share Screen** — pick your monitor if you have multiple
5. Others watch in the app or on their phone at `http://<host-ip>:9002`
6. Toggle mic with the **Mic On/Off** button
7. Anyone can take over sharing by clicking **Share Screen** while someone else is sharing

## Architecture

```
Sharer Desktop                    Viewers
┌─────────────────────┐          ┌──────────────┐
│  grim / xcap        │          │  Desktop App  │
│    ↓ JPEG frames    │          │  (React)      │
│  ffmpeg / cpal      │──WS:9001──│  canvas +     │
│    ↓ PCM audio      │          │  Web Audio    │
│  broadcast channel  │          └──────────────┘
│    ↓                │          ┌──────────────┐
│  axum HTTP ─────────│──:9002───│  Phone Browser│
│  (viewer.html)      │          │  (no install) │
└─────────────────────┘          └──────────────┘
```

| Component | Tech |
|-----------|------|
| Desktop framework | Tauri 2 (Rust + React) |
| Screen capture | grim (Linux/Wayland), xcap (macOS/Windows) |
| Audio capture | ffmpeg PulseAudio (Linux), cpal (macOS/Windows) |
| Transport | WebSocket binary frames (0x01=video, 0x02=audio) |
| Web viewer | Vanilla JS + Canvas + Web Audio API |
| HTTP server | Axum (port 9002) |

## Ports

| Port | Purpose |
|------|---------|
| 9001 | WebSocket stream server |
| 9002 | HTTP web viewer |

## License

[MIT](LICENSE)
