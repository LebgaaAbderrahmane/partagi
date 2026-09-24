# Testing

Partagi uses:

- **Vitest** (+ Testing Library) for frontend unit/component tests
- **`cargo test`** for Rust unit tests
- **CI** runs both on every PR

## Commands

```bash
# Frontend
pnpm test              # run once
pnpm test:watch        # watch mode

# Rust (from repo root)
cd src-tauri
cargo test

# Typecheck (not a substitute for tests)
pnpm exec tsc --noEmit
```

## Frontend

### Tooling

- Vitest (aligns with Vite)
- `jsdom` environment for DOM APIs (`localStorage`, events)
- `@testing-library/react` + `@testing-library/jest-dom` for components

Config lives in `vite.config.ts` (`test` block) or `vitest.config.ts`.

### What to test

| Area | Priority | Notes |
|------|----------|-------|
| `loadRecent` / `saveRecent` (Home) | High | Pure-ish; mock `localStorage`; cap 5, dedupe, uppercase |
| Room code normalize/validate helpers | High | Case, trim, empty |
| URL builders (viewer URL from stream URL + room) | High | Must include `?room=` |
| `Modal` | High | Escape close, role/aria, focus trap (when implemented) |
| `Toast` | Medium | queue, auto-dismiss, variant classes |
| `Button` | Low | variant/size class mapping |
| `Session` reconnect helper | High | backoff schedule once extracted |
| Full `Session` | Low/optional | Heavy WS/canvas mocks — prefer extracting pure logic |

### Patterns

- Mock `@tauri-apps/api/core` (`invoke`) for any test that touches `tauri-commands`.
- Prefer testing **pure functions** extracted from components over full render trees when logic is dense (recent sessions, backoff, RMS normalize, etc.).
- Use `localStorage.clear()` in `beforeEach`.

Example:

```ts
import { describe, it, expect, beforeEach } from "vitest";

// under test: loadRecent/saveRecent
beforeEach(() => localStorage.clear());
```

## Rust (`cargo test`)

### Already natural units

| Module | Tests |
|--------|-------|
| `stream::common::Quality` | `scale()`, `jpeg_quality()`, `frame_interval_ms()` per variant |
| `normalize_code` / `generate_code` | length, uppercase, stability of normalize |
| `extract_room_from_query` | `room=`, missing, extra params, empty |
| `ensure_member` | member vs non-member |
| `active_host` | LAN vs Remote with/without public_host |
| Session leave/GC helpers | empty-room removal, TTL predicate (if extracted) |

### How to add

Prefer **pure functions** over `#[tauri::command]` wrappers (commands need `State`). If logic lives in a command, extract a free function and test that.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_uppercases_and_trims() {
        assert_eq!(normalize_code("  abcd1234ef56 "), "ABCD1234EF56");
    }
}
```

For async broadcast fan-out:

```rust
#[tokio::test]
async fn broadcaster_delivers_to_subscriber() { /* … */ }
```

### What not to unit-test in CI

- grim/ffmpeg/xcap process spawns (integration/manual)
- Real WebSocket handshakes against a live port (optional future `#[tokio::test]` with `TcpListener` on ephemeral port is possible)
- Full Tauri `State` lifecycle (use extracted logic)

## Manual / exploratory checklist

Run before a release (see also [features.md](features.md), [remote.md](remote.md)):

- [ ] Create session → code length 12, uppercase display
- [ ] Second device joins via code; participant list updates ≤ 2s
- [ ] Share empty room → immediate monitor picker
- [ ] Second sharer requests → approval UI on first sharer
- [ ] Quality change while sharing restarts capture
- [ ] Mic meter moves; mobile hears audio after unlock tap
- [ ] QR opens viewer on phone on LAN
- [ ] Remote mode: URLs switch to public host; `/health` OK from WAN
- [ ] Leave confirm (`Shift+Q`) and Esc
- [ ] Sidebar collapse + stats persist after reload
- [ ] Kill WS (toggle network) → reconnect UX behaves
- [ ] Idle session expires after TTL (or force shorter TTL in a debug build)

## CI integration

In `.github/workflows/ci.yml` after install:

```yaml
- name: Frontend tests
  run: pnpm test

- name: Rust tests
  run: cargo test
  working-directory: src-tauri
```

Keep `pnpm build` and `cargo check` as well — tests complement, not replace, type/borrow checks.

## Related

- [Development](development.md)
- [Architecture](architecture.md)
