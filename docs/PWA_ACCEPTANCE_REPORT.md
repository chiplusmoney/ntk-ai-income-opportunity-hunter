# PWA Acceptance Report — M5b

Date: 2026-10-15

## Verdict

**PARTIAL — one viewport, one route, view-only.** This is the first time the
built app has been rendered in a real browser in this project, and the render
confirms the M5 changes survived to the screen. It is **not** the acceptance pass
the brief asks for: tablet and desktop widths, route-by-route coverage, the
install prompt, and the offline/reconnect cycle were **not** exercised.

## What was actually done

1. Built a relative-path copy of the PWA (`vite build --base ./ --outDir
   dist-browser-check`) so it could be opened as a workspace file — the browser
   tool refuses `http://localhost` (private-network target), and a normal `dist/`
   build uses absolute `/assets/...` paths that do not resolve under `file://`.
2. Opened it in the browser pane and captured a screenshot and the DOM text.

## What the render proves

| Observation | Evidence |
|-------------|----------|
| The app boots and React renders | full DOM: sidebar (desktop nav) + bottom nav (mobile), top bar, "Hunter online" |
| Mobile layout works at ~425×591 | screenshot below; no clipping, readable typography, 5-item bottom nav |
| **The cost distinction reaches the screen** | every card renders **"No upfront cost found — verify before proceeding"** — the M5 wording, not "$0 capital" |
| The confirmed-only filter exists and is off by default | filter chips: "No upfront cost" (active), **"Confirmed $0 only"**, "No CV required", "Direct pay", "Nigeria + Global" |
| Demo rows cannot be mistaken for live data | each card shows **"DEMO ROW"** and "Demo client (placeholder)"; the list shows the "Demo data" banner |
| Ranking wording is the M5 wording | cards show "96 % rank" (not the old "% match") |
| Rewards render with their basis | "$500 – $1,500 one-off", "$15 – $45 per hour" |
| The initial dashboard route renders | sidebar, mobile nav and the top bar all present |

Rendered route: `/opportunities` (the Explore screen).

## What the render does NOT prove

| Not covered | Why |
|-------------|-----|
| Tablet (≈820px) and desktop (≈1440px) layouts | the pane exposes a fixed ~425×591 viewport; no resize control |
| Every route (detail, evidence panel, saved/offline, applications, earnings, profile, notifications, AI) | interaction was refused: `browser_workspace_file_denied`. Only the first two navigations succeeded before the denial took effect |
| Deep links / BrowserRouter paths | under `file://` there is no server to resolve client-side routes on reload |
| Install prompt / standalone PWA | needs an HTTPS origin; `file://` cannot be installed |
| Service worker registration | browsers refuse service workers on `file://` |
| IndexedDB persistence across reloads | `file://` origins are opaque and storage is unreliable there |
| Offline → reconnect cycle, queued-action sync | needs a served origin plus network control |
| Touch-target and safe-area measurement | requires device emulation or a real device |

None of these are app defects — they are limits of what a view-only workspace file
render can test. They remain **unverified**.

## Screenshot (mobile viewport, ~425×591)

The Explore screen as rendered: heading "Explore opportunities", the filter chip
row, and four demo cards each carrying the caution badge.

```
[ hamburger ]        [ Hunter online ]        [ bell ] [ NTK ]

Explore opportunities
Verified evidence, eligibility and earning fit in one place.

[ Search skills, categories, platfor… ]      [ Filters ]
( No upfront cost )( Confirmed $0 only )( No CV required )
( Direct pay )( Nigeria + Global )

┌──────────────────────────────────────────────┐
│ Development                        96 % rank │
│ React Developer — Landing Page               │
│ Demo client (placeholder) · 12 min ago · DEMO ROW
│ $500 – $1,500 one-off                        │
│ (No upfront cost found — verify before…)(Remote)│
└──────────────────────────────────────────────┘
   … three more demo cards …
[ Home ][ Explore ][ Applied ][ Earnings ][ Profile ]
```

## Automated evidence that stands alongside this (not a substitute)

- Production build succeeds; the shipped bundle contains **both** cost wordings.
- No `AIza` key, service-account field, private key or scheduler secret in the
  client bundle.
- 63 web unit tests: mapping, tri-state cost wording, legacy-record coercion,
  query/index agreement, repository live→cache→error behaviour, profile
  validation and persistence, demo-row honesty.
- Emulator rules tests: published listings anonym readable, everything
  user-owned isolated, all server-managed writes denied.

## What would close this gate

A served HTTPS origin (Firebase Hosting on the project named in the deployment
receipt), a browser environment where the pane can attach and interact, and a
device-emulation pass at 390×844, 820×1180 and 1440×1000 — which is exactly what
the M1 receipt recorded for the static prototype, now to be repeated against the
live app.

Until then this report stays **PARTIAL**, and no acceptance is claimed.
