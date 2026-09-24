# Partagi

Lightweight screen sharing for small teams. No cloud accounts, no lag-prone relays on your LAN — direct WebSocket streaming. Optional **remote mode** via port forwarding when teammates are off-network.

Share your screen with 3-10 people at up to ~30fps with mic audio. Mobile devices join via a web browser — no app install needed.

## Why

Existing tools (Meet, Discord, Zoom) compress aggressively and add latency through relay servers. Partagi runs on your machine — capture once, fan out directly. Use **LAN** mode on the same network, or **Remote** mode with your own port forwards when you need the internet (no Partagi-operated cloud).

## Features

- **~30fps screen sharing** via native capture (grim on Linux, xcap on macOS/Windows)
- **Quality presets** — Low / Balanced / High (scale, JPEG, FPS)
- **Mic audio** with live level meter
- **Multi-monitor** selection
- **Share approval flow** — empty room starts instantly; occupied rooms require the current sharer to approve
- **Mobile web viewer** — `http://<host>:9002/?room=CODE` + QR invite
- **LAN or Remote** — Remote uses public IP/hostname + port forwarding ([docs/remote.md](docs/remote.md))
- **Room-scoped streaming** — 12-character codes; WebSocket requires `?room=`
- **Cross-platform** — Linux, macOS, Windows
- **Shortcuts** — `S` share, `M` mic, `Shift+Q` leave, `Esc` close

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/architecture.md](docs/architecture.md) | System design, ports, capture matrix |
| [docs/features.md](docs/features.md) | Full feature reference & shortcuts |
| [docs/remote.md](docs/remote.md) | Over-internet / port-forward setup |
| [docs/security.md](docs/security.md) | Threat model, what is enforced, gaps |
| [docs/development.md](docs/development.md) | Dev environment, conventions, PR flow |
| [docs/testing.md](docs/testing.md) | Vitest + cargo test guidance |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Common failures & fixes |
| [prd.md](prd.md) | Product requirements & roadmap |

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
2. Click **New Session** — you get a 12-character room code
3. Share the code (and viewer link/QR) with your team
4. Click **Share Screen** — pick your monitor if you have multiple
5. If someone else is sharing, your request waits for their approval
6. Others watch in the app or on their phone at the viewer URL
7. Toggle mic with **Mic On/Off**
8. Set **Network → Remote** and forward ports 9001/9002 if teammates are off-LAN ([guide](docs/remote.md))

## Architecture

```
Sharer Desktop                    Viewers
┌─────────────────────┐          ┌──────────────┐
│  grim / xcap        │          │  Desktop App  │
│    ↓ JPEG frames    │          │  (React)      │
│  ffmpeg / cpal      │──WS:9001──│  canvas +     │
│    ↓ PCM audio      │          │  Web Audio    │
│  per-room broadcast │          └──────────────┘
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
| Transport | WebSocket binary frames (0x01=video, 0x02=audio), room required |
| Web viewer | Vanilla JS + Canvas + Web Audio API |
| HTTP server | Axum (port 9002) |

More detail: [docs/architecture.md](docs/architecture.md).

## Ports

| Port | Purpose |
|------|---------|
| 9001 | WebSocket stream server (`?room=` required) |
| 9002 | HTTP web viewer |

## License

[MIT](LICENSE)
