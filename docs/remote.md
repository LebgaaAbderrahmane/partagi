# Remote / Over-Internet Setup (Port Forwarding)

Partagi can be used beyond your local network by forwarding two ports on your router to the machine running the sharer. This is the **port-forward mode** — no cloud relay, no accounts.

> **Security first:** Remote mode exposes ports to the internet. Complete the checklist in [Security](security.md) before sharing a public URL.

## How it works

```
Sharer PC (LAN 192.168.x.x)          Router (public IP)           Viewers (internet)
┌──────────────────────┐            ┌──────────────────┐         ┌─────────────────┐
│ Partagi              │            │ Port forward     │         │ Phone / laptop  │
│  :9001  WS stream  ──┼────────────┼─► WAN:9001 → LAN │◄────────┤ browser         │
│  :9002  HTTP viewer ─┼────────────┼─► WAN:9002 → LAN │◄────────┤ opens viewer URL│
└──────────────────────┘            └──────────────────┘         └─────────────────┘
```

- **9001** — WebSocket media stream (binary JPEG + PCM)
- **9002** — HTTP page that serves the mobile/desktop web viewer

## Prerequisites

1. A public IPv4 address on your router (or a DDNS hostname that points to it).
2. Ability to log in to your router admin panel.
3. The **LAN IP** of the machine running Partagi (shown in the app under Network → Remote).
4. Not behind **CGNAT** (many mobile/cellular ISPs put you behind CGNAT — you cannot forward ports then). See [Limitations](#limitations).

## Step-by-step

### 1. Enable Remote mode in Partagi

1. Open Partagi → home screen.
2. Expand **Network: LAN**.
3. Select **Remote**.
4. Enter your **public IP or hostname** (or click **Detect**).
5. Note the **LAN IP** displayed — you will forward to it.

Setting persists for the process lifetime. Links, copy buttons, and QR codes will now use the public host.

### 2. Forward ports on your router

Exact UI varies by brand. General steps:

1. Find your router’s admin address (often `192.168.1.1` or `192.168.0.1`).
2. Log in (credentials on the router label).
3. Open **Port Forwarding** / **NAT** / **Virtual Server**.
4. Add two rules:

| Name | External port | Internal IP | Internal port | Protocol |
|------|---------------|-------------|---------------|----------|
| Partagi stream | 9001 | `<your LAN IP>` | 9001 | TCP |
| Partagi viewer | 9002 | `<your LAN IP>` | 9002 | TCP |

5. Save and reboot the router if prompted.

### 3. Open the host firewall

On the sharer machine, allow only your team’s source IPs if possible.

**Ubuntu / Debian (ufw):**

```bash
# Replace 203.0.113.0/24 with your team's IP range (or use your public IP)
sudo ufw allow from 203.0.113.0/24 to any port 9001 proto tcp
sudo ufw allow from 203.0.113.0/24 to any port 9002 proto tcp
```

**Arch:**

```bash
sudo iptables -A INPUT -p tcp --dport 9001 -s 203.0.113.0/24 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 9002 -s 203.0.113.0/24 -j ACCEPT
```

**Windows:** allow Partagi (or ports 9001–9002) in Windows Defender Firewall for Private networks.

### 4. Verify from outside the LAN

From a phone on cellular (or another network):

```bash
# From any machine with curl
curl -s http://YOUR_PUBLIC_IP:9002/health
# expected: ok
```

Open `http://YOUR_PUBLIC_IP:9002/?room=SESSIONCODE` in a browser — the viewer should connect (you’ll see Connecting → waiting for stream).

### 5. Share the join link

Inside a session, the header shows the viewer URL and **QR** code. In Remote mode these already point at your public host. Teammates can:

- Open the URL on a phone browser, or
- Scan the QR code.

Desktop teammates join with the **12-character room code** in the Partagi app (set Network → Remote on *their* machine too if they will share their own screen later; viewers only need the URL).

## Dynamic IP (DDNS)

If your ISP rotates your public IP:

1. Set up DDNS (router built-in, or DuckDNS / No-IP).
2. Enter the **hostname** (e.g. `home.duckdns.org`) as Public IP/hostname in Partagi.
3. Port-forward as above.

## TLS / HTTPS

Partagi serves plain **HTTP** and **ws://**. Browsers will show “Not secure.” For a trusted cert:

- Put a reverse proxy (Caddy, nginx) on 443 that terminates TLS and proxies to 9001/9002, **or**
- Use a tunnel product that provides TLS (out of scope for default Partagi).

Media is still room-code gated at the WebSocket layer; TLS adds transport encryption against passive sniffing.

## Limitations

| Issue | What to do |
|-------|------------|
| **CGNAT** (no public IPv4) | Port forwarding will not work. Use a VPN mesh (Tailscale/WireGuard) between teammates, or a tunnel (Cloudflare Tunnel, ngrok) in front of 9001/9002. |
| **Double NAT** (modem + router) | Forward on both devices, or put the modem in bridge mode. |
| **Asymmetric home upload** | 5 remote viewers ≈ 12 MB/s upload. Use Quality → Low if upload is limited. |
| **No STUN/TURN relay** | Built-in P2P NAT traversal is not implemented; this mode assumes successful port forwards. |

## Troubleshooting

See [Troubleshooting](troubleshooting.md#remote-and-port-forwarding) — common failures are closed firewall, wrong LAN IP in the forward rule, and ISP CGNAT.

## Related

- [Architecture](architecture.md)
- [Security](security.md)
- [Features](features.md)
