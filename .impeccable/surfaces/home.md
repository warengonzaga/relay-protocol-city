# Home: Relay World

Primary target: `index.html` (`/`). Related targets: `src/main.js`, `src/style.css`, `src/journey-ui.css`, `src/responsive.css`, `src/city.js`, `src/environment.js`, `src/district-layout.js`, `src/world-map.js`, `src/routes.js`, `src/travelers.js`, and `src/traffic.js`.

Mode: **Experience**. Visitors explore a miniature city to understand transfer origins, destinations, value tiers, and illustrated journey stages. The city leads the first viewport; surrounding controls expose source scope, inspection, and camera access.

## Direction contract

**THESIS:** A transfer becomes a small traveler in a physical miniature city. Chains define districts; homes and reported app buildings define its addresses.

**OWN-WORLD:** Real GLB buildings, characters, and vehicles; a colorful dusk diorama with continuous sidewalks, signal-controlled roads, checkpoints, stations, and an elevated railway. Relay's approved dark palette, self-hosted Inter, official white wordmark, and compact panels frame this incumbent miniature world.

**STORY:** Start inside Ethereum, watch incoming, outgoing, and local journeys, then inspect a traveler or activity row to distinguish animation from API stage. **City overview** reveals Ethereum and the compact Base connection point; clicking either district or choosing it from the selector focuses that neighborhood. The source selector identifies demo versus recent Relay activity; the demo journey selector isolates existing scenarios.

**FIRST VIEWPORT:** Ethereum is focused below the header. Its title and the return-to-overview button sit upper left, source/district/flyover controls upper right, and the demo journey selector beneath them. A scrolling district activity panel occupies the left side, with **All**, **In**, **Out**, and **Local** controls. Camera controls sit lower right; a compact rail, queue, and checkpoint readout sits along the lower scene. Sample statistics occupy the footer. The modeled neighborhood remains the dominant artifact.

**FORM:** City-builder miniature diorama with geometric chain signage and Relay brand chrome. The user pinned the miniature world and approved the dark brand change. The original concept seed `359655f9` is historical context; this refresh does not select a new world or standing comp preference.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction and motion

Picking a traveler or activity row opens route, amount, attribution, pace source, API stage, and a separately labeled animated phase. The guide explains that these are stage illustrations. Demo examples explicitly state that no funds moved.

The implemented city contains two manually authored, fixed layouts. Ethereum is the first detailed neighborhood, with a larger street network, varied building heights and footprints, several blocks, and parks. Base is a compact connection point awaiting a separate neighborhood design. Border checkpoints have four vehicle and four pedestrian holding spaces in Ethereum and two of each in Base, with clear through lanes and separate access aisles. Each district has separate Relay homes with and without garages, app commons, a bus terminal, a larger police station, a rail stop, and one gate shared by incoming and outgoing ground traffic. Ethereum has five fixed name-only app buildings ranked by available historical volume: Fun, LI.FI, Fomo, MetaMask, OKX, tallest first. INTEGRATORS.md records provenance and visibility limits. Base has one observed app site. Overflow and unknown apps use that district's commons. Reported attribution is not proof of app ownership.

Street geometry, building sizes, and parcel positions come from `src/district-layout.js`. Sample counts do not resize or rearrange them. A neutral highway and sidewalks connect the gates; crosschain ground trips leave their origin, use that connection, and enter their destination. Same-chain journeys stay on local streets. Chain hover labels appear only in city overview; isolated districts use the existing page heading.

Pedestrians use sidewalks and crossings; road vehicles use directional lanes and signals. Same-chain pedestrians run a local loop with the model's actual `sprint` clip. Crosschain pedestrians run when measured or estimated duration is at most 15 seconds, otherwise they walk. Relay NPCs use no-garage homes and Relay cars use garage-equipped homes; reported integrator NPCs and cars travel between app addresses. Buses use district terminals. Same-chain trips vary their local loop and return to the exact starting address. Ethereum has dense clusters, more grass and trees, and a rounded uneven perimeter.

The single gate in each district illustrates the origin-to-fill handoff. Origin-pending crosschain ground trips wait in an off-lane inspection bay. Destination-stage trips awaiting confirmation stop in the destination gate bay; completion lets them rejoin, while a later failure invokes an escort or tow to the destination police station; confirmed trips pass without a timed toll stop. Completed requests replay, and failed/refunded trips return. For ground travelers, `BLOCKED` and `BLOCKED_WALLET` outcomes trigger a playful police boarding/escort or tow to a district police station. This is an outcome illustration, not an assertion of enforcement or a literal fund location. Live progression uses normalized API stages; the **Release demo gates** button is available only in simulation.

Two separate rail lanes run in opposite directions. Each admits one confirmed-success train, with other successful trains queued. Pending, failed, and refunded train-sized requests do not animate. Trains enter at the rear yard/tunnel, stop at origin and destination stations, then exit through the yard. Chain compass bearings independently define flights and do not reuse district positions. Airplanes are absent from focused districts. In overview, airplanes and trains show origin/destination identity; the demo-only **Whale flyover** creates and selects an illustrative large transfer.

District focus isolates the selected neighborhood at its border, clipping roads, railway, outside traffic and shadows, and changes the feed to trips touching it. Hovered chain labels are buttons; clicking outside the district restores overview. Incoming means the selected district is the destination; outgoing means it is the origin. Both exclude same-chain trips, which belong only to Local. The direction buttons show counts and filter the list. **City overview** and camera reset restore the shared view. Arrows/WASD pan, Q/E rotate, and +/− zoom; drag orbits, right-drag/two fingers pan, scrolling zooms, and traffic can be paused. Reduced-motion users start with paused traffic and no animated camera focus; a deliberate flyover resumes demo traffic. Journey speed is scaled for viewing, not a settlement clock.

## Responsive composition

At 760px and below, navigation hides, source/district controls stack, and activity starts collapsed. The operations readout sits above the camera toolbar; activity sits above it with bounded scrolling. Overview shows at most three rows; district focus exposes its direction controls and up to twelve scrolling rows. The scene has a 520px minimum with the readout present, and the page permits vertical scrolling. Trip details and the guide occupy the lower scene with bounded scrolling. Camera, return-to-overview, direction, and close controls use mobile touch targets.

The orthographic camera adapts to aspect ratio. District labels are hidden when their projected position overlaps an interface panel. Additional width refinements occur at 430px, 1100px, and 1650px, with compact desktop text at short heights. Exact tokens and layout values belong in `DESIGN.md`.

## Data and asset boundaries

- Relay activity represents a recent sample and its latest available stages. The footer describes supported trips, known value, and chains **in the sample**, scoped to the selected district when focused.
- Network-wide pending visibility and global daily totals remain unverified. The feed retains conservative integrator-sample labeling unless the configured access scope establishes otherwise.
- Demo data remains explicit in the status line, activity badge, inspector, and guide. A failed live fetch can fall back to a clearly labeled demo city.
- Both live and demo views include only trips whose two endpoints are Ethereum or Base. Unsupported routes are excluded from the scene and list, never remapped into either district. The broader chain registry and real API normalization remain intact. Within this scope, the district filter matches either origin or destination.
- Real GLB assets supply buildings and travelers. The official Relay wordmark and self-hosted Inter are used by the interface. Provenance, licenses, and source URLs are maintained in `ASSETS.md`.

## Evidence and outstanding verification

Source inspection covers the palette, typography, models, controls, journey semantics, responsive rules, and reduced-motion behavior. CSS is split into base styles (`src/style.css`), journey components (`src/journey-ui.css`), and responsive rules (`src/responsive.css`).

Browser captures and review artifacts are retained locally and excluded from Git. Current validation evidence, capture scope, and remaining limitations belong in `VERIFICATION.md`; this surface contract does not certify a test run or browser review. Network-wide pending visibility remains unverified.
