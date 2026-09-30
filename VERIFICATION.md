# Verification evidence

Checked September 30, 2026, on Node.js 22.16.0 and Vite 8.3.1. Local preview: `http://127.0.0.1:5173/`. This revision replaces generated neighborhoods with a manually designed Ethereum district and a compact Base connection point.

## Current local proof

| Contract | Evidence | Result |
| --- | --- | --- |
| Manual district design | Explicit street, parcel, park, station and gate coordinates in `src/district-layout.js` | Ethereum has 25 authored sites and varied model sizes; Base has six sites. Layout never resizes from API activity. |
| Single gate and shared highway | Routing tests cover supported chain pairs, same-chain loops, neutral road ownership and both travel directions | PASS; each district has one bidirectional gate. Crosschain ground journeys use the shared highway. |
| Building and railway clearances | Tests inspect actual model bounds, garages, sidewalks, parks, station structures and rail supports | PASS; rendering and routing share the same authored addresses and street geometry. |
| Pending and failed journeys | Controller tests cover bays, status updates, returns, signals, queues and cleanup; browser pending scenario reaches inspection and releases into the through lane | PASS; passing trips have no timed toll dwell. |
| Two-chain activity | Shared selector tests cover supported endpoints and incoming/outgoing/local partitions | PASS; requests involving other chains are excluded, never reassigned to Ethereum or Base. |
| District focus | Ethereum is the default; native canvas click from overview focuses Ethereum; district selector and back control inspected | PASS; activity follows the selected district. |
| Direction controls | Desktop and mobile Incoming/Outgoing filters and same-chain Local scenario inspected | PASS for these states; counts partition the supported district sample. |
| Responsive presentation | 1280 × 720 desktop and 390 × 844 mobile captures, expanded and collapsed activity | PASS; no horizontal document overflow at 390 px. |
| Entire automated suite | `npm test` | PASS: 55 tests, zero failures. |
| Production and Pages builds | `npm run build`, `npm run build:pages` | PASS; the existing Three.js chunk triggers the bundle-size advisory. |
| Independent code review | Integrated topology, routing, camera, data and rendering review | Confirmed camera-resize and mobile-panel findings fixed; final review found no remaining high-confidence blockers. |
| Independent visual review | Ethereum focus, overview, Base focus and two mobile states | Intro contrast finding fixed and the same five states recaptured; final disposition: ship. |
| Fresh browser runtime | Error log read-back from a fresh local tab after source changes | PASS; no errors captured. |
| Credential boundary | Configured local key checked against publishable source and built frontend | PASS; `.env` is ignored and the key stays server-side. |

Local screenshot evidence is excluded from Git in `.impeccable/review/`: `ethereum-focused.jpg`, `ethereum-overview.jpg`, `base-focused.jpg`, `ethereum-mobile-collapsed.jpg`, `ethereum-mobile.jpg`, and `ethereum-pending.jpg`. These captures show rendered states, not an exhaustive animation, accessibility or device-performance matrix. Reduced-motion logic is covered by controller tests; OS-level reduced-motion behavior was not separately exercised in the browser. No collision-physics guarantee is claimed.

## Live data and public hosting boundaries

The local preview uses the configured server-side `RELAY_API_KEY` and displays **Live integrator sample**. This does not establish visibility into every integrator, all pending requests, or network-wide daily totals. The map and activity list show only Ethereum–Base trips and same-chain trips within these two districts. An empty supported sample is shown explicitly.

District geometry is hand-authored and fixed. No Scout warehouse counts or sample-derived district weights are published. Base is a connection point pending its own design pass; additional districts are intentionally deferred.

The scene caps at 40 travelers and 150 queued live requests. Exact-ID refreshes rotate through unresolved IDs in batches of 12. Missing updates never invent completion. Completed requests replay; scene positions illustrate API stages and are not exact fund locations. Demo journeys are labeled as simulations.

GitHub Pages publishes only the static `dist/` artifact. The public site remains in labeled demo mode until a public API URL is configured. The Pages workflow, deployed revision and unauthenticated public page are the delivery authority. No Railway deployment or account mutation was performed in this revision.

The earlier split-hosting checks remain applicable: the separate non-root API container serves health/activity, rejects frontend and `.env` paths, and applies configured browser-origin access rules. That container integration was not redeployed to Railway here.
