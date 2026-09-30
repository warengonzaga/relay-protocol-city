# Verification evidence

Checked September 30, 2026, on Node.js 22.16.0 and Vite 8.3.1. Local preview: `http://127.0.0.1:5173/`. This revision refines the district map, neutral highways, checkpoints, labels, railway and police effects.

## Current local proof

| Contract | Evidence | Result |
| --- | --- | --- |
| District shapes and sampled sizing | Irregular polygon geometry; unique touched-chain request counts; bounded square-root width; first layout frozen until reload | PASS; areas are illustrative, not exact market-share percentages |
| Neutral highway and sidewalks | Every neutral road and sidewalk sampled against actual district polygons | PASS; public corridors belong to no district |
| Ground journey ownership | All 13 × 13 origin/destination combinations for pedestrians and cars, including unknown-chain interchange | PASS; crosschain trips touch only origin, neutral space and destination; same-chain loops stay local |
| Failed return paths | All-pair car returns and exact reverse pedestrian curves | PASS; return paths preserve roads and crossings |
| Pending inspection | Controller tests plus Demo → Waiting at the toll → inspector → Release demo gates | PASS; one off-lane bay is reserved per district, including the shared Other hub; passing trips have no timed toll dwell |
| Signals and lifecycle | Real traffic-controller tests for junction signals, following, status updates, pending/fill holds, returns, cleanup and queues | PASS |
| Railway geometry | Generated rail-deck, support, platform, canopy and stair geometry in equal-width and sample-weighted maps | PASS; station structures remain in their territory, grounded supports meet the deck, stairs and columns clear roads and towers |
| Train concurrency | Demo → Two-track train queue | PASS; both rails occupied with a third departure queued |
| Flight geometry | Varied deterministic entry points, destination bearings relative to the resized map, consistent failure returns | PASS; rendered sky scenario inspected |
| Police effects | Boarding phase observed in browser; red/blue light and glow updates, pause and reduced-motion branches checked in controller tests | PASS; single-frame captures do not prove alternating motion by themselves |
| Label visibility | Names absent initially and after reset; selecting a chain or clicking a territory reveals one name; pointer handling reviewed | PASS for those interactions; no separate automated mouse-only hover or touch-device test claimed |
| Desktop and mobile | 1280 × 720 and 390 × 844 browser inspections; mobile defaults to collapsed activity; viewport override reset | PASS for captured states; no horizontal overflow |
| Production and Pages builds | `npm run build`, `npm run build:pages` | PASS; Three.js is about 676 KB minified / 171 KB gzip and triggers the bundle-size advisory |
| Entire automated suite | `npm test` | PASS: 53 tests, zero failures |
| Review | Independent bounded geometry, routing, lifecycle and maintainability review | Confirmed findings fixed and checked before delivery |
| Fresh browser runtime | New local tab after final source changes; browser error log read-back | PASS; no errors captured |
| Credential boundary | Configured local key scanned against publishable source and built frontend | PASS; `.env` is ignored and the key stays server-side |

Screenshots are retained in `.impeccable/review/` locally and excluded from Git: `feedback-mobile.jpg`, `feedback-pending.jpg`, `feedback-police.jpg`, `feedback-trains.jpg`, `feedback-sky.jpg`, and the final desktop/public overview. They show rendered states rather than an exhaustive animation, accessibility or device-performance matrix. No collision-physics guarantee is claimed.

## Live data and public hosting boundaries

The local preview uses the user-configured `RELAY_API_KEY` with authenticated `/requests/v3` and displays **Live integrator sample**. This proves local authenticated sample access. It does not establish visibility into every integrator, all pending requests, or a network-wide daily total.

Scout was consulted on a defensible sizing metric. The published map uses the initial API sample (or explicitly labeled demo requests), not private warehouse counts. Each request touches its origin and destination once; same-chain requests count once. Layout stays fixed until reload.

The scene caps at 40 travelers and 150 queued live requests. Exact-ID refreshes rotate through unresolved IDs in batches of 12. Missing updates never invent completion. Completed requests replay; scene positions illustrate API stages and are not exact fund locations.

GitHub Pages publishes only the static `dist/` artifact. The public site remains in labeled demo mode until a public API URL is configured. The Pages workflow, deployed revision and unauthenticated public page are the delivery authority. No Railway deployment or account mutation was performed in this refinement.

The earlier split-hosting checks remain applicable: the separate non-root API container serves health/activity, rejects frontend and `.env` paths, and applies configured browser-origin access rules. A local Pages build calling the separate authenticated container was verified in the previous hosting revision. That integration was not redeployed to Railway here.
