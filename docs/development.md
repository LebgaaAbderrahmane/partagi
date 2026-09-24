# Development Guide

How to run, change, test, and ship Partagi.

## Prerequisites

| Tool | Version / notes |
|------|-----------------|
| Rust | stable ([rustup](https://rustup.rs/)) |
| Node.js | ≥ 22 |
| pnpm | 11 (`corepack enable` or install globally) |
| Linux deps | `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `grim`, `ffmpeg` |
| macOS | Xcode CLT |
| Windows | WebView2, VS Build Tools |

```bash
# Debian/Ubuntu example
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
  libappindicator3-dev librsvg2-dev patchelf grim ffmpeg
```

## Setup

```bash
git clone https://github.com/LebgaaAbderrahmane/partagi.git
cd partagi
pnpm install
```

## Run

```bash
# Dev (Vite + Tauri, hot reload UI)
pnpm tauri dev

# Frontend only
pnpm dev

# Typecheck + production bundle
pnpm build
```

## Project layout

```
partagi/
  src/                    React app
    App.tsx               Root + view routing
    components/           Home, Session, ui/
    lib/tauri-commands.ts IPC wrappers
    index.css             Design tokens + classes
  src-tauri/
    src/main.rs           AppState, commands, WS + HTTP servers, GC
    src/stream/           capture + Quality + broadcaster
    viewer.html           mobile viewer (embedded via include_str!)
  docs/                   this documentation set
  prd.md                  product requirements / roadmap
  PKGBUILD                Arch packaging
  .github/workflows/      CI + release
```

## Architecture docs

Read before deep changes:

- [Architecture](architecture.md)
- [Security](security.md)
- [Features](features.md)

## Testing

See [testing.md](testing.md) for how to run unit/integration tests (frontend Vitest + Rust `cargo test`) and what to cover when you change protocol or session logic.

Local quick checks:

```bash
pnpm exec tsc --noEmit
pnpm test
cd src-tauri && cargo test
cd src-tauri && cargo check
```

## Code conventions

- **TypeScript**: strict; thin `invoke` wrappers in `tauri-commands.ts`; no business logic in `App.tsx` beyond view state.
- **React**: functional components; shared UI in `components/ui/`; icons from `lucide-react`; styles via semantic classes in `index.css` (avoid large inline style blocks).
- **Rust**: commands return `Result<T, String>` with human-readable errors; normalize room codes; lock order **sessions → broadcasters** if both are needed; never `expect` on optional user input paths.
- **Commits**: conventional style (`feat:`, `fix:`, `docs:`, `test:`).
- **Do not** commit build artifacts, `pkg/`, or `target/`.

## Pull request flow

1. Branch from `main`: `feat/…`, `fix/…`, `docs/…`.
2. Implement; keep the PR focused.
3. Verify locally:

   ```bash
   pnpm exec tsc --noEmit
   pnpm test
   cd src-tauri && cargo check && cargo test
   ```

4. Push and open a PR; CI **Build verification** must pass.
5. Merge with a merge commit (keeps PR history).

## CI

`.github/workflows/ci.yml` on push/PR to `main`:

- Install system deps, Node 22, pnpm 11, stable Rust
- `pnpm build` (tsc + vite)
- `cargo check`
- `cargo test` / `pnpm test` (when test suites exist — see testing docs)
- `pnpm tauri build` → upload `.deb` (required) and `.rpm` (optional)

## Release

1. Bump versions in: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `PKGBUILD`, `.SRCINFO`.
2. Update `README.md` artifact names and `prd.md` roadmap.
3. Commit, tag `vX.Y.Z`, push tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. `release.yml` builds Linux (.deb/.rpm), macOS (.dmg), Windows (.exe/.msi) and attaches them to a GitHub Release (`generate_release_notes: true`).

## Troubleshooting dev environment

See [troubleshooting.md](troubleshooting.md).

## Related

- [Testing](testing.md)
- [Remote setup](remote.md) (for manual E2E over internet)
