# Relay City

A miniature crosschain city built with Three.js and real licensed 3D models. Chains are districts; Relay app transfers travel between homes, while reported integrators travel between their app buildings. The interface follows Relay's official dark design-system colors, Inter, and white wordmark.

## Run locally

Requires Node.js 22.16 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Choose **Demo city → Try a journey** to explore same-chain sprints, OpenSea ETH → Base, origin or destination confirmation checkpoints, failed returns, blocked escorts, train queues, or sky routes. **Relay activity** uses the configured API feed, or clearly labeled demo data if unavailable.

The city opens focused on Ethereum. Click a district, its hovered name, or choose it from the selector to isolate it at its border. Clicking outside the district or **City overview** restores the full map. The focused feed offers **All**, **In**, **Out**, and **Local** trips. Hold **arrow keys or WASD** to move across the map; click the map to return keyboard focus after using a control. Use **Q/E** to rotate and **+/−** to zoom. Drag to orbit, right-drag or use two fingers to pan, and scroll or use buttons to zoom. Select travelers or activity rows for details. Traffic can be paused; reduced-motion preferences start it paused. **Release demo gates** changes simulation only.

## The city

- Two manually authored districts: Ethereum is the first detailed neighborhood, with clustered homes, varied building heights, grass pockets, street trees, and a rounded uneven outline. Base is a compact connection point awaiting its own neighborhood design. Their layouts and building sizes are fixed, not generated or resized from sample counts. Each district has one gate for incoming and outgoing ground traffic. Road corners turn continuously; three-way junctions retain the sidewalk on their closed side. A neutral highway and sidewalks connect the gates, so crosschain ground trips use their origin, the shared connection, and their destination.
- Pedestrians use sidewalks and junction crosswalks and pass through one another without collision stops. Same-chain trips loop back to the original address and run. Other pedestrians sprint when a positive measured or estimated duration is at most 15 seconds; the inspector distinguishes those timing sources.
- Relay pedestrians use houses without garages; Relay cars use houses with garages. Each request keeps its chosen home across status updates. Integrator pedestrians and cars use their app building and its garage. Same-chain trips take a stable, varied local loop and return to the exact origin address. Buses travel between district bus terminals. Integrator names come from the reported referrer namespace. Missing attribution stays unknown. Ethereum has five fixed named buildings, tallest first: Fun, LI.FI, Fomo, MetaMask, and OKX, ranked by available-history Ethereum volume. [Ranking and attribution evidence](INTEGRATORS.md) documents the dated snapshot and API visibility limits. Other or unknown apps use the commons; Base retains one observed app site. Building forms and locations follow the authored neighborhood plan.
- Cars, buses, and trucks use road lanes, shared timed traffic lights, garages, and following-distance queues. Failed cars turn into a return lane.
- Toll gates sit at district borders and illustrate the origin-to-fill handoff. Confirmed trips pass without a timed toll stop. Origin-pending crosschain ground requests wait in an off-lane inspection bay for API evidence; destination-stage requests awaiting confirmation wait at the destination gate bay, then continue only after completion. Later failures there use an escort or tow to that destination district's police station. Further checks remain in the tracked queue when the bay is occupied. Origin failures or refunds return home; exact `BLOCKED` or `BLOCKED_WALLET` failures use police boarding or towing to the origin district's station. Police vehicles carry alternating red/blue lights during pickup and escort. Lights freeze with pause and remain steady under reduced motion. This is playful visualization of an API outcome, not a claim about a user's conduct.
- The elevated tracks, gantries, and platforms use one shared route geometry. Trains enter from a covered rail yard, stop at their origin and destination stations, then disappear through the tunnel. Two opposite lanes allow one train each; further trains queue. Only confirmed-success requests animate as trains; pending, failed, or refunded train-sized requests remain absent from the map.
- Airplanes appear only in City overview; district focus has no airplanes or flyover control. Flight bearings are independent of district layout: Base is north at 0° and Ethereum is at 30°. Flights enter from varied directions, deterministic per request so failure returns stay consistent, and turn toward the destination bearing shown on their label. Unconfirmed fills circle until completion; failures take a return flight.

Tiers: under $100 pedestrian; $100–$1,000 car; $1,000–$10,000 bus; $10,000–$100,000 truck; $100,000–$1 million train; $1 million or more airplane. These visualization thresholds are editable editorial choices.

## Data and API key

Copy `.env.example` to `.env` and configure a server-side `RELAY_API_KEY` for `/requests/v3`. Never put the key in browser code or a `VITE_` variable. Only set `RELAY_NETWORK_SCOPE=global` after Relay confirms network-wide access. Otherwise the feed remains labeled an integrator sample.

A standard v3 key does not guarantee visibility into all pending Relay requests or every integrator's referrer. The adapter requests authenticated attribution, but respects the data returned. See the [Requests reference](https://docs.relay.link/references/api/get-requests) and [migration guide](https://docs.relay.link/references/api/api_guides/migrating-to-requests-v3).

For a temporary local preview, `RELAY_ALLOW_LEGACY_PREVIEW=true` opts into anonymous `/requests/v2`. **V2 retires November 24, 2026.** Production needs an approved v3 key and verified access scope.

The app polls every 12 seconds. The server caches the latest 50 requests for 10 seconds. A rotating batch of up to 12 unresolved active or queued request IDs receives exact-ID refreshes so leaving the latest page does not release a pending traveler. Failed or missing lookups never invent completion. The response can contain up to 62 records; tracking limitations are surfaced in the data guide. The scene holds at most 40 travelers and a bounded recent queue, so this is a sampled visualization, not a firehose indexer.

Both live and demo views include only routes whose origin and destination are Ethereum or Base. Unsupported endpoints are excluded from the city and activity list, never mapped onto a supported district. Focusing a district shows trips touching that district; incoming and outgoing exclude same-chain trips, which appear under **Local**. The broader chain registry and real API normalization remain intact.

**No daily or complete-network total is claimed.** Counts and values describe the supported trips in the current sample and selected district. One traveler is one request, not separate deposit/fill transactions. USD tiers use the origin input amount. Missing values remain unknown, private referrer suffixes are removed, and demo IDs never link to real transactions.

The inspector separates **API stage** from **city animation**. Completed requests replay their journey. Scene positions illustrate confirmed stages; animation duration is scaled for viewing and does not identify the exact location of funds. Live pending gates and destination holds require actual status updates to advance.

## Build and verification

```sh
npm test
npm run build
npm start
```

The combined local production server serves `dist/` and `/api/activity` on port 4174. `npm run dev` continues to use Vite's same-origin API proxy. For the split deployment below, `npm run build:pages` builds the frontend for `/relay-protocol-city/`, and the Dockerfile runs only the API. No database is needed.

Tests cover normalization, attribution, stage evidence, bounded tracking, safe serving, all district routes, sidewalks, lanes, train queues, red lights, pending and completion holds, late failures, police cleanup, and same-ID speed updates. The verification scope is recorded in [VERIFICATION.md](VERIFICATION.md).

## Hosting: GitHub Pages + Railway

One repository supplies two deployments:

| Host         | Contents                                                     | Configuration                            |
| ------------ | ------------------------------------------------------------ | ---------------------------------------- |
| GitHub Pages | `dist/`: the city, models, fonts, and other static assets    | Public `VITE_API_URL` build variable     |
| Railway      | `server.mjs` and `src/activity.js` in a small Node container | Private `RELAY_API_KEY` runtime variable |

The browser renders the 3D scene. Railway fetches and caches Relay activity; it serves no frontend assets in `API_ONLY` mode. The Docker build context allows only the API files, package metadata, and license. It excludes `.env`, `node_modules`, `dist`, and the models, and installs no dependencies.

### 1. Connect the Railway API

Connect this repository's `main` branch with the repository root as the service root. Railway [detects the Dockerfile](https://docs.railway.com/builds/dockerfiles); leave build and start command overrides empty. The container sets `API_ONLY=true` and `HOST=0.0.0.0`, and reads Railway's `PORT`.

Set these service variables:

| Variable                     | Value                                            |
| ---------------------------- | ------------------------------------------------ |
| `RELAY_API_KEY`              | Your private Relay key, entered only in Railway  |
| `RELAY_NETWORK_SCOPE`        | `integrator` unless Relay confirms global access |
| `RELAY_ALLOW_LEGACY_PREVIEW` | `false`                                          |
| `ALLOWED_ORIGINS`            | `https://waren.build`                            |

`ALLOWED_ORIGINS` accepts comma-separated exact origins, without paths or trailing slashes. This repository's Pages site inherits the account's `waren.build` domain. Use your deployed frontend's origin when forking or changing domains. This controls browser access; the public activity endpoint is not user-authenticated.

Set the service healthcheck to `/healthz`. It checks the process without calling Relay, so a healthy result does not establish live-feed access. Set watch paths to `server.mjs`, `src/activity.js`, `package.json`, `Dockerfile`, `.dockerignore`, and `LICENSE` to avoid rebuilding the API for frontend-only changes. Generate a public Railway domain and confirm `/healthz` responds, then check `/api/activity` returns the expected live or demo status.

These service settings will be configured through Railway when connected. There is no `railway.json`: Railway's [current config-as-code reference](https://docs.railway.com/reference/config-as-code) deprecates that format for new services.

### 2. Publish the GitHub Pages frontend

In this repository's **Settings → Pages**, choose **GitHub Actions** as the publishing source. Under **Settings → Secrets and variables → Actions → Variables**, add the repository variable:

```text
VITE_API_URL=https://your-service.up.railway.app/api/activity
```

Use the complete public activity URL, including `/api/activity`. This URL is intentionally visible in the browser. **Do not add the Relay API key as a `VITE_` variable or pass it to the Pages build.** The workflow does not need a Relay GitHub Secret.

Push to `main` or manually run **Deploy city to GitHub Pages**. The [Pages workflow](.github/workflows/pages.yml) runs the tests, builds for the repository subpath, uploads only `dist/`, and deploys it. The site address is `https://waren.build/relay-protocol-city/`. See GitHub's [custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

If `VITE_API_URL` is not configured, the Pages build runs a clearly labeled demo without API polling. Once the Railway URL exists, set the variable and rerun the workflow. Changing a GitHub variable requires a new frontend build; changing the private key in Railway does not.

To preview the Pages build locally:

```sh
npm run build:pages
npm run preview:pages -- --host 127.0.0.1
```

Open the printed `/relay-protocol-city/` preview address. To test against a deployed API, set the public `VITE_API_URL` while building and add the preview origin to Railway's `ALLOWED_ORIGINS` temporarily.

## Contributing and licenses

Copyright (c) 2026 Relay City contributors. Application source is licensed under the [GNU General Public License version 3](LICENSE) (`GPL-3.0-only`). Models, fonts, and Relay branding have separate terms; see [ASSETS.md](ASSETS.md). Keep all notices, truthful data labels, accessibility, and reduced-motion behavior. Use small focused changes and run the tests/build. Source repository: [warengonzaga/relay-protocol-city](https://github.com/warengonzaga/relay-protocol-city).
