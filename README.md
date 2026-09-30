# Relay City

A miniature crosschain city built with Three.js and real licensed 3D models. Chains are districts; Relay app transfers travel between homes, while reported integrators travel between their app buildings. The interface follows Relay's official dark design-system colors, Inter, and white wordmark.

## Run locally

Requires Node.js 22.16 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Choose **Demo city → Try a journey** to explore same-chain sprints, OpenSea BNB → Base, pending checkpoints, failed returns, blocked escorts, train queues, or sky routes. **Relay activity** uses the configured API feed, or clearly labeled demo data if unavailable.

Drag to orbit, scroll or use buttons to zoom, choose a chain to focus its district, and select travelers or activity rows for details. Traffic can be paused; reduced-motion preferences start it paused. **Release demo gates** changes simulation only.

## The city

- Twelve illustrated districts: Base, Ethereum, Solana, Arbitrum, Optimism, Polygon, BNB, Avalanche, Bitcoin, Unichain, HyperEVM, and Linea. Other chains use a labeled neutral interchange.
- Pedestrians use sidewalks and junction crosswalks. Same-chain trips loop back to the original address and run. Other pedestrians sprint when a positive measured or estimated duration is at most 15 seconds; the inspector distinguishes those timing sources.
- Relay app journeys use houses and garages. Integrator names come from the reported referrer namespace. Missing attribution stays unknown. Each district currently has two dedicated app towers; further apps share a neutral commons. This keeps the initial map legible without falsely naming another app's building.
- Cars, buses, and trucks use road lanes, shared timed traffic lights, garages, and following-distance queues. Failed cars turn into a return lane.
- Toll gates illustrate the origin-to-fill handoff. Pending requests wait for API evidence. Failed/refunded requests return. Exact `BLOCKED` or `BLOCKED_WALLET` failures use police boarding or towing to the origin district's station. This is playful visualization of an API outcome, not a claim about a user's conduct.
- Trains enter from a covered rail yard, stop at their origin and destination stations, then disappear through the tunnel. Two opposite lanes allow one train each; further trains queue. Pending fills remain at the destination until confirmed, and later failures return to the origin station.
- Flight bearings are independent of district layout: Base is north at 0°, BNB is south at 180°, and the other ten chains occupy 30° increments. Flights cross from origin bearing toward destination bearing. Unconfirmed fills circle until completion; failures return toward their origin.

Tiers: under $100 pedestrian; $100–$1,000 car; $1,000–$10,000 bus; $10,000–$100,000 truck; $100,000–$1 million train; $1 million or more airplane. These visualization thresholds are editable editorial choices.

## Data and API key

Copy `.env.example` to `.env` and configure a server-side `RELAY_API_KEY` for `/requests/v3`. Never put the key in browser code or a `VITE_` variable. Only set `RELAY_NETWORK_SCOPE=global` after Relay confirms network-wide access. Otherwise the feed remains labeled an integrator sample.

A standard v3 key does not guarantee visibility into all pending Relay requests or every integrator's referrer. The adapter requests authenticated attribution, but respects the data returned. See the [Requests reference](https://docs.relay.link/references/api/get-requests) and [migration guide](https://docs.relay.link/references/api/api_guides/migrating-to-requests-v3).

For a temporary local preview, `RELAY_ALLOW_LEGACY_PREVIEW=true` opts into anonymous `/requests/v2`. **V2 retires November 24, 2026.** Production needs an approved v3 key and verified access scope.

The app polls every 12 seconds. The server caches the latest 50 requests for 10 seconds. A rotating batch of up to 12 unresolved active or queued request IDs receives exact-ID refreshes so leaving the latest page does not release a pending traveler. Failed or missing lookups never invent completion. The response can contain up to 62 records; tracking limitations are surfaced in the data guide. The scene holds at most 40 travelers and a bounded recent queue, so this is a sampled visualization, not a firehose indexer.

**No daily or complete-network total is claimed.** Counts and values describe the current sample. One traveler is one request, not separate deposit/fill transactions. USD tiers use the origin input amount. Missing values remain unknown, private referrer suffixes are removed, and demo IDs never link to real transactions.

The inspector separates **API stage** from **city animation**. Completed requests replay their journey. Scene positions illustrate confirmed stages; animation duration is scaled for viewing and does not identify the exact location of funds. Live pending gates and destination holds require actual status updates to advance.

## Build and verification

```sh
npm test
npm run build
npm start
```

The production server serves `dist/` and `/api/activity` on port 4174. Set `HOST` and `PORT` for hosting. Static-only hosts cannot protect an API key; the live feed requires this Node service or an equivalent server function.

Tests cover normalization, attribution, stage evidence, bounded tracking, safe serving, all district routes, sidewalks, lanes, train queues, red lights, pending and completion holds, late failures, police cleanup, and same-ID speed updates. The verification scope is recorded in [VERIFICATION.md](VERIFICATION.md).

## Hosting

The complete live app needs a Node web service because `/api/activity` uses a private Relay API key. The existing server serves both the built city and its API from the same origin.

For a [Render Node web service](https://render.com/docs/deploy-node-express-app), connect this repository and use:

- Runtime: Node.js 22.16 or newer.
- Build command: `npm ci --include=dev && npm run build`.
- Start command: `npm start`.
- Environment: `HOST=0.0.0.0`, `RELAY_NETWORK_SCOPE=integrator`, and `RELAY_ALLOW_LEGACY_PREVIEW=false`.
- Secret environment variable: `RELAY_API_KEY`, entered in the hosting dashboard. Let the host provide `PORT`.

[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) only hosts static files. Hosting the frontend there would require a separate API backend, a configurable API URL/CORS policy, and repository-subpath asset support; this repository does not yet configure that split deployment. [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) are available during workflows, not as a private runtime API for Pages visitors. Never copy `.env` or embed the Relay key in the frontend build. A workflow-generated activity snapshot is possible but would not provide the live pending-stage behavior.

## Contributing and licenses

Copyright (c) 2026 Relay City contributors. Application source is licensed under the [GNU General Public License version 3](LICENSE) (`GPL-3.0-only`). Models, fonts, and Relay branding have separate terms; see [ASSETS.md](ASSETS.md). Keep all notices, truthful data labels, accessibility, and reduced-motion behavior. Use small focused changes and run the tests/build. Source repository: [warengonzaga/relay-protocol-city](https://github.com/warengonzaga/relay-protocol-city).
