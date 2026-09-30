# Verification evidence

Checked September 30, 2026, on Node.js 22.16.0 and Vite 8.3.1. Source is prepared for the public `warengonzaga/relay-protocol-city` repository. Preview: `http://127.0.0.1:5173`.

**Local implementation: verified at the scope below. Authenticated v3 sample: verified after the user configured an API key. Network-wide pending coverage remains unverified.** Browser inspection now works; this supersedes the initial build's browser-tool blocker.

| Contract | Action and current evidence | Result |
| --- | --- | --- |
| Production compilation | `npm run build` | PASS; Three.js remains 666 KB minified / 167 KB gzip and triggers the bundle-size advisory |
| Data, status and error normalization | `test/activity.test.js`, including exact BLOCKED_WALLET, hash-based fill evidence, measured/estimated timing and unknown referrers | PASS |
| Bounded exact-ID tracking and server safety | Activity tests cover latest-page eviction, shared caches, missing lookups, malformed IDs, secret protection, traversal and writes | PASS |
| District addresses, sidewalks, lanes, same-chain loops and compass flights | `test/routes.test.js`, all 12 × 12 district pairs plus neutral hub | PASS |
| Traffic lights, gate queues, returns, police cleanup, train queues and destination holds | `test/traffic.test.js`, real traffic controller with lightweight scene/model doubles | PASS |
| Entire automated suite | `npm test` | PASS: 43 tests, zero failures |
| Relay dark branding, models and desktop composition | Current browser at 1280 × 720; desktop and train captures below | PASS for captured states |
| Responsive composition | Browser at 390 × 844, collapsed and expanded activity captures | PASS for captured states; viewport reset afterward |
| Train concurrency | Demo → Two-track train queue | PASS: both rails occupied, one queued; flyover disabled with correct recovery guidance |
| Pending gate and release | Demo → Waiting at the toll → first car → Release demo gates | PASS: inspector showed waiting at toll; two waiting checkpoints became zero and car advanced to road traffic |
| Blocked outcome | Demo → Blocked: police escort → first commuter | PASS for observed inspector transition to district police escort; exact motion endpoints also covered by controller tests; no phase-matched screenshot claimed |
| Guide and keyboard dismissal | Meet the traffic → Escape | PASS: guide closed and focus returned to its opener; trip inspector also dismissed with Escape |
| Runtime errors | Browser console error read-back after final reload | PASS: no errors captured |
| Public Relay sample | Local `/api/activity` read-back | PASS: HTTP 200, live mode, sample coverage, 50 normalized transfers, dailyCount null; the latest count can vary when malformed rows are excluded |
| Fresh review | Independent source/lifecycle review and bounded visual re-review | APPROVE in reviewed scope; flyover enabled-without-flight finding fixed; no remaining actionable findings in that scope |
| Authenticated v3 sample | Restarted server with user-configured key; `/api/activity` returned HTTP 200, live mode, 50 records; browser showed Live integrator sample and no console errors | PASS for authenticated sample; all 50 observed stages were complete, so global pending visibility remains NOT PROVEN |
| Network-wide daily count | No authoritative aggregate endpoint configured | UNAVAILABLE; UI only claims sampled counts and value |
| Public source repository | Publication requested to `warengonzaga/relay-protocol-city` | Remote commit is the authoritative publication record; hosting is separate |
| Pages build | `npm run build:pages`; static preview under `/relay-protocol-city/` | PASS: repository-prefixed HTML, models, fonts and credits; explicit demo when the public API URL is unset |
| Separate API container | Built Docker image and exercised health, activity and static paths | PASS: non-root process, no installed dependencies, only LICENSE/package.json/server.mjs/src/activity.js in `/app`; health 200, frontend and `.env` 404 |
| Browser access boundary | New API hosting tests plus container read-back | PASS: configured origin allowed with exact CORS header; unlisted browser origin 403 before Relay fetch; no credentials or key in response |
| Split authenticated flow | Static frontend on local port 4173 calls API container on 4175 | PASS: browser showed Live integrator sample, loaded 3D models, and no console errors; normalized record count varied from 48 to 50 |
| Hosting review | Independent source and container review of the split deployment | PASS: no actionable findings |
| Public Pages deployment | GitHub Actions deploys only the static `dist/` artifact | Deployment workflow and public URL are the authoritative current status; demo until the Railway API URL is configured |
| Railway deployment | Container prepared and tested locally; Railway MCP not yet connected | NOT DEPLOYED; no provider configuration or live Railway access claimed |

## Browser evidence

Screenshots are retained in the local review folder and excluded from Git. Inspected states: desktop live sample, both occupied train lanes with a queued third train, pending checkpoint with inspector, mobile overview, mobile expanded activity, authenticated live preview, and the Pages build calling a separate authenticated API container (`pages-live-split.jpg`).

These are rendered states, not an exhaustive animation or device matrix. Loading/error/empty and reduced-motion branches have source and automated supporting checks where applicable, but were not all exercised interactively. No sustained device-performance benchmark or collision-physics guarantee is claimed.

## Data boundary

The user supplied a server-side `RELAY_API_KEY` locally after the initial checks. The preview now uses authenticated `/requests/v3`; the key takes precedence over legacy preview configuration and stays outside browser code. A live read-back returned 50 completed records. The app retains conservative integrator-sample labeling: network-wide pending and referrer access are not established by that response. Anonymous v2 is no longer the active preview path.

Travelers illustrate the API's latest confirmed stage. Completed requests replay; missing status updates never release pending travelers. Live tracked IDs rotate in batches of 12, the scene caps at 40 travelers, and the live queue caps at 150. This is a bounded sampled city, not a complete real-time ledger or exact location of funds.
