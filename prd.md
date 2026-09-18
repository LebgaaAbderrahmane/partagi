Product Requirements Document
Team Screen Share — Lightweight P2P Screen Sharing for Small Teams

Status: Draft v1 Owner: Abdou
1. Summary

A lightweight desktop app that lets a small team (3–10 people) share their screen with each other in high resolution and low latency — without the overhead, compression artifacts, and lag of tools like Google Meet or Discord. Any participant can become the active screen-sharer during a session. After a session ends, an AI-generated summary and action-item list is produced automatically from the conversation.

The product is not a general-purpose video conferencing tool. It intentionally excludes webcam and chat to keep the experience fast, simple, and focused on one thing: showing your screen to your team, clearly, with everyone able to talk over it.
2. Problem Statement

Existing tools (Google Meet, Discord, Zoom) route media through general-purpose infrastructure optimized for massive scale, which means:

    Screen share resolution and frame rate are aggressively compressed to save server bandwidth and cost
    Latency is added by multi-hop relay/transcoding pipelines
    The tools are heavier than needed for a 3–10 person dev/work team that just wants to show something on screen and talk about it
    Meeting takeaways (decisions, action items) are not captured — teams rely on manual notes or memory afterward

Small teams (e.g., dev teams, freelancers, small startups) need a fast, high-quality, low-friction way to show their screen to teammates and walk away from the session with a clear record of what was decided.
3. Goals

    Enable one-to-many screen sharing within a small team (3–10 participants) at high resolution with minimal, near real-time latency
    Allow any participant to become the active sharer during a session (roles are not fixed)
    Support live mic audio for all participants during a session
    Automatically generate a written meeting summary and action-item list after each session, using AI
    Keep the app lightweight, fast to join (link or code), and free of unnecessary features (no chat, no webcam in v1)

Non-Goals (v1)

    Large-scale broadcasting (100+ viewers)
    Webcam video
    In-app text chat
    Screen or session recording/playback (beyond what's needed to generate the AI summary — see §7.4 for data handling)
    Mobile clients (desktop-first for v1)

4. Target Users

    Small software development teams (3–10 people) doing code reviews, pair debugging, or design walkthroughs
    Small startup/agency teams needing quick internal screen shares without spinning up a heavier meeting tool
    Freelancers/consultants sharing progress with a small client team

5. Core Features (v1)
5.1 Session / Room Management

    A participant creates a session and receives a shareable link or room code
    Teammates join via the link/code, using the same desktop app
    Sessions are ephemeral — no persistent team workspace concept required for v1

5.2 Screen Sharing (symmetric roles)

    Any participant can click Share Screen to become the active sharer
    Only one active screen share at a time per session
    Handoff UX: if a participant wants to share while someone else already is, the app sends a request prompt to the current sharer (X wants to share — hand over?). The current sharer can approve, or the takeover proceeds automatically after a short timeout if there's no response. This avoids both accidental interruptions and the forgot to stop sharing problem.
    Target quality: 1080p, 30–60fps, tuned for low latency over raw compression ratio

5.3 Mic Audio

    All participants' microphones are live by default (voice-call style) so anyone can talk while someone else shares
    Self-mute: each participant can mute/unmute themselves at any time via a mic toggle (Google Meet-style) — mute state is local and always under the participant's own control
    AI-based noise suppression applied client-side before publishing (quality-of-life item, can ship v1 or fast-follow)

5.4 AI Meeting Summary & Action Items

    During the session, audio from all participants is transcribed (speech-to-text)
    When the session ends, the transcript is passed to an LLM to generate:
        A short written summary of what was discussed
        A list of extracted action items (what was decided needs to be done, and by whom if stated)
    The summary is shown in-app at session end and can be exported/copied (e.g., to paste into Slack, Notion, etc.)
    Only the transcript (text) is retained for this purpose — no video/audio recording is stored (see §7.4)

6. User Flows
6.1 Starting a Session

    User opens the app → clicks New Session
    App creates a room and displays a shareable link/code
    User shares the link with teammates (via Slack, WhatsApp, etc. — outside the app)

6.2 Joining a Session

    Teammate opens the app → enters the code or clicks the link
    App connects them to the room; they see a waiting/connected state with participant list

6.3 Sharing a Screen

    Any participant clicks Share Screen
    OS-level picker appears (select monitor/window)
    Stream publishes to the room; all other participants automatically see it
    Sharer clicks Stop Sharing to end, freeing the slot for another participant

6.4 Ending a Session & Getting the Summary

    Last participant leaves or explicitly ends the session
    App finalizes the transcript and sends it for summarization
    Summary + action items are displayed in-app within a short processing delay
    User can copy/export the result

7. Technical Approach
7.1 Client

    Framework: Tauri (Rust core + web-based UI) — lighter than Electron, good native access for screen capture and hardware-accelerated encoding
    Platforms: Windows and macOS for v1 (Linux as stretch goal)

7.2 Media Transport

    Protocol: WebRTC for real-time audio/video
    SFU: Self-hosted LiveKit — forwards (does not transcode) the active screen share and all mic audio tracks to participants, keeping the sharer's upload bandwidth flat regardless of team size
    Dynamic track publish/unpublish used to support the any participant can share requirement (switching the active video track when sharing changes hands)

7.3 Signaling & Session Management

    A lightweight backend service issues LiveKit join tokens and manages room codes/links
    No persistent state beyond the life of a session is required for v1

7.4 AI Summary Pipeline

    Speech-to-text: real-time or near-real-time transcription of each participant's mic track (e.g., via a local model such as faster-whisper, or a cloud STT API)
    Transcript assembled per-session with speaker attribution
    On session end, transcript sent to an LLM with a summarization + action-item extraction prompt
    Data handling: only text transcripts are persisted for summarization; screen/audio media itself is not recorded or stored, to limit privacy exposure of shared screens

7.5 Architecture Diagram (conceptual)

[Participant PC] ─┐
[Participant PC] ─┼── WebRTC ── LiveKit SFU (self-hosted) ── WebRTC ──┐
[Participant PC] ─┘                                                    └─ back to all peers
        │                                    │
        │ mic audio tracks                   │ transcript at session end
        ▼                                    ▼
  STT pipeline  ───────────────────────►  LLM summarizer ──► Summary + action items shown in-app

8. Success Metrics

    Latency: end-to-end screen share glass-to-glass latency under a defined target (e.g., <150ms) at 1080p
    Reliability: session join success rate, connection drop rate during active sessions
    Adoption within target teams: sessions per week, average participants per session
    AI summary usefulness: qualitative feedback on whether generated summaries are accurate/useful (e.g., simple thumbs up/down in-app)

9. Risks & Open Questions
Risk / Question Notes
NAT traversal failures Some networks (corporate firewalls, symmetric NAT) will require TURN relay fallback — adds cost/complexity but necessary for reliability
Self-hosted SFU operational cost/complexity Needs a VPS and basic ops; acceptable for v1 scale (3–10 person rooms)
Sharing handoff UX Resolved: request/approve flow with timeout fallback (see §5.2)
Mic-always-on vs. push-to-talk Resolved: always-on with self-mute, Google Meet-style (see §5.3)
Transcription accuracy for mixed-language teams (e.g., Arabic/French/English) May affect summary quality; worth testing STT model performance on target languages early
Privacy of shared screen content No screen recording planned, but worth an explicit in-app disclosure of what is/isn't captured (transcript only)
10. Roadmap (indicative)

Phase 1 — Core plumbing

    LiveKit self-hosted + token backend
    Tauri app: join a room, connect, see participant presence (no media)

Phase 2 — Media

    Mic publish/subscribe
    Screen capture + publish, single hardcoded sharer (proof of concept)
    Any-participant sharing + handoff logic

Phase 3 — AI Summary

    STT pipeline wired to mic tracks
    Session-end transcript → LLM summary + action items
    In-app display + export/copy

Phase 4 — Polish

    Noise suppression
    UI/UX refinement, room link flow
    Hardware encoder tuning for quality

Future (post-v1) — see backlog

    Real-time translation of captions
    Session recap search (long-term knowledge base over past sessions)
    Screen content intelligence (AI reading what's on screen)

