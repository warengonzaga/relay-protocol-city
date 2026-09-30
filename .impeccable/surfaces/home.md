# Home: Relay City

Primary target: `index.html` (`/`). Related targets: `src/main.js`, `src/style.css`, `src/journey-ui.css`, `src/responsive.css`, `src/city.js`, `src/environment.js`, `src/world-map.js`, `src/routes.js`, `src/travelers.js`, and `src/traffic.js`.

Mode: **Experience**. Visitors explore a miniature city to understand transfer origins, destinations, value tiers, and illustrated journey stages. The city leads the first viewport; surrounding controls expose source scope, inspection, and camera access.

## Direction contract

**THESIS:** A transfer becomes a small traveler in a physical miniature city. Chains define districts; homes and reported app buildings define its addresses.

**OWN-WORLD:** Real GLB buildings, characters, and vehicles; a colorful dusk diorama with continuous sidewalks, signal-controlled roads, checkpoints, stations, and an elevated railway. Relay's approved dark palette, self-hosted Inter, official white wordmark, and compact panels frame this incumbent miniature world.

**STORY:** See traffic, recognize a chain district, select a traveler or activity row, and distinguish its animated journey from its API stage. The source selector identifies demo versus recent Relay activity; the demo journey selector isolates existing scenarios.

**FIRST VIEWPORT:** A scene below the header with an introduction upper left, source/filter/flyover controls upper right, and the demo journey selector beneath them. Activity sits lower left; camera controls lower right; a compact rail, queue, and checkpoint readout sits between them. Sample statistics occupy the footer. The city remains the dominant artifact.

**FORM:** City-builder miniature diorama with geometric chain signage and Relay brand chrome. The user pinned the miniature world and approved the dark brand change. The original concept seed `359655f9` is historical context; this refresh does not select a new world or standing comp preference.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction and motion

Picking a traveler or activity row opens route, amount, attribution, pace source, API stage, and a separately labeled animated phase. The guide explains that these are stage illustrations. Demo examples explicitly state that no funds moved.

The implemented city contains twelve dedicated chain districts: Base, Ethereum, Solana, Arbitrum, Optimism, Polygon, BNB, Avalanche, Bitcoin, Unichain, HyperEVM, and Linea. Other chains share a neutral hub. Each named district has Relay homes, two app towers, app commons, a police station, and a rail stop. Towers gain labels from observed referrers; overflow and unknown apps use commons. Reported attribution is not proof of app ownership.

Pedestrians use sidewalks and crossings; road vehicles use directional lanes and signals. Same-chain pedestrians run a local loop with the model's actual `sprint` clip. Crosschain pedestrians run when measured or estimated duration is at most 15 seconds, otherwise they walk. Relay trips move house to house; reported integrators travel between app addresses.

Checkpoints illustrate the origin-to-fill handoff. Pending trips wait, completed requests replay, and failed/refunded trips return. For ground travelers, `BLOCKED` and `BLOCKED_WALLET` outcomes trigger a playful police boarding/escort or tow to a district police station. This is an outcome illustration, not an assertion of enforcement or a literal fund location. Live progression uses normalized API stages; the **Release demo gates** button is available only in simulation.

Two separate rail lanes run in opposite directions. Each admits one train, with other eligible trains queued. Trains enter at the rear yard/tunnel, stop at origin and destination stations, then exit through the yard. Chain compass bearings independently define flights and do not reuse district positions. Airplanes and trains show origin/destination identity; the demo-only **Whale flyover** creates and selects an illustrative large transfer.

Drag to orbit, scroll or use buttons to zoom, reset the view, and pause traffic. Reduced-motion users start with paused traffic and no CSS animation; a deliberate flyover resumes demo traffic. Journey speed is scaled for viewing, not a settlement clock.

## Responsive composition

At 760px and below, navigation hides, source/filter controls stack, and activity starts collapsed. The operations readout spans the lower scene above the camera toolbar; activity sits above it with bounded scrolling and at most three visible rows. The scene has a 520px minimum with the readout present, and the page permits vertical scrolling. Trip details and the guide occupy the lower scene with bounded scrolling. Camera and close targets become 44px.

The orthographic camera adapts to aspect ratio. District labels are hidden when their projected position overlaps an interface panel. Additional width refinements occur at 430px, 1100px, and 1650px, with compact desktop text at short heights. Exact tokens and layout values belong in `DESIGN.md`.

## Data and asset boundaries

- Relay activity represents a recent sample and its latest available stages. The footer describes trips, known value, and chains **in the sample**.
- Authenticated v3 sample access has been verified locally. Network-wide pending visibility and global daily totals remain unverified. The feed retains conservative integrator-sample labeling.
- Demo data remains explicit in the status line, activity badge, inspector, and guide. A failed live fetch can fall back to a clearly labeled demo city.
- The chain filter matches either origin or destination. Unknown chains retain neutral hub labeling rather than inheriting an unrelated chain district.
- Real GLB assets supply buildings and travelers. The official Relay wordmark and self-hosted Inter are used by the interface. Provenance, licenses, and source URLs are maintained in `ASSETS.md`.

## Evidence and outstanding verification

Source inspection covers the palette, typography, models, controls, journey semantics, responsive rules, and reduced-motion behavior. CSS is split into base styles (`src/style.css`), journey components (`src/journey-ui.css`), and responsive rules (`src/responsive.css`).

Browser captures and review artifacts are retained locally and excluded from Git. Desktop at 1280 × 720 and mobile at 390 × 844 were inspected, including expanded activity, the train queue, and a pending-trip inspector. The bounded independent finish review approved the interface after the flyover availability fix.

The current automated suite and both production builds pass; the exact result is recorded in VERIFICATION.md. These checks and captured states do not constitute an exhaustive animation, device, or accessibility matrix. Authenticated v3 sample access is verified; network-wide pending visibility remains unverified. See `VERIFICATION.md` for scope and remaining limits.

## Current feedback revision

The miniature identity is preserved. Districts are bordered territories containing street loops, not separate land pads. Sizes use a bounded, globally comparable square-root transform of the first sample and freeze until reload. Names appear on territory hover/tap/filter focus. Border inspection bays hold pending travelers while confirmed traffic crosses without a timed toll wait. Routes, addresses and scene geometry share the same coordinates. Flights have varied deterministic entries and fixed destination bearings, with an in-flight direction caption. Gantries and station platforms use the canonical railway centerline. Police lights draw attention during boarding and escort and respect pause/reduced motion.

District outlines are irregular map territories with varied proportions and planted edges. A shared highway and sidewalks occupy neutral space between districts. Crosschain ground routes leave only their origin district, use the common network, then enter only their destination; same-chain journeys stay on local streets. The size is an illustrative bounded mapping of sampled activity, not an exact geographic area or network market share.
