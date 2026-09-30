---
name: Relay City
description: A colorful miniature transfer city framed by Relay's dark interface.
colors:
  canvas: "#161616"
  paper: "#1c1c1c"
  surface: "#232323"
  hover: "#2d2d2d"
  ink: "#ededed"
  muted: "#a0a0a0"
  purple: "#4615c8"
  purple-hover: "#3901aa"
  accent-text: "#a7aaff"
  accent-surface: "#221166"
  focus: "#a7aaff"
  line: "#343434"
  success: "#63c174"
  warning: "#ffc53d"
  warning-surface: "#302008"
  danger: "#ff8b7a"
  white: "#ffffff"
  accent-bright: "#dbdeff"
  tabletop: "#1c2030"
  lawn: "#263e38"
  road: "#252934"
  sidewalk: "#6b6c77"
  ethereum: "#a394e8"
  base: "#2563eb"
  solana: "#36c6a0"
  arbitrum: "#5a9acb"
  optimism: "#ee5c66"
  polygon: "#9764d8"
  bnb: "#efb90b"
  avalanche: "#e84142"
  bitcoin: "#f7931a"
  unichain: "#ff3d9a"
  hyperevm: "#6ee7c4"
  linea: "#b6edee"
  neutral-hub: "#9a99aa"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(28px, 3.05vw, 46px)"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.6px"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "11px"
    fontWeight: 700
  micro:
    fontFamily: "Inter, sans-serif"
    fontSize: "9px"
    fontWeight: 700
    letterSpacing: "0.5px"
rounded:
  badge: "4px"
  chip: "5px"
  row: "7px"
  link: "8px"
  control: "9px"
  toolbar: "10px"
  panel: "14px"
spacing:
  tight: "8px"
  control-gap: "10px"
  panel-padding: "25px"
  scene-inset: "32px"
  page-inset: "38px"
components:
  whale-button:
    backgroundColor: "{colors.purple}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 14px"
  whale-button-hover:
    backgroundColor: "{colors.purple-hover}"
  relay-link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.link}"
    padding: "12px 16px"
  scene-control:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.row}"
    width: "40px"
    height: "40px"
  source-select:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "43px"
  activity-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    width: "288px"
  trip-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.row}"
    padding: "9px 8px"
  preview-badge:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning}"
    typography: "{typography.micro}"
    rounded: "{rounded.badge}"
    padding: "4px 6px"
  stage-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    padding: "4px 7px"
  city-operations:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.toolbar}"
    padding: "12px 15px"
---

# Design System: Relay City

## Overview

**Creative North Star: "The tabletop transfer city"**

The confirmed world is a colorful, toy-like city made from real 3D building, character, and vehicle models. Dusk materials, planted blocks, lit checkpoints, and an elevated railway establish its miniature scale. Relay's dark surfaces, purple actions, Inter typography, and official white wordmark frame the city without replacing its playful model silhouettes.

Chains organize the landscape into individually authored districts; the buildings represent Relay homes, reported integrators, and shared app space. Ethereum is the first detailed neighborhood, with Base retained as a compact connection point. The initial view focuses Ethereum. District clicks and the selector change focus, while **City overview** returns to both neighborhoods. Compact inspection panels explain the journeys without presenting the animation as a literal map of funds.

**Key Characteristics:**

- Colorful modeled districts and travelers against a dark tabletop.
- Relay dark surfaces, purple actions, Inter type, and the official wordmark.
- Compact rounded controls with shallow ambient shadows.
- Visible source scope, stage labels, and a text route into the scene.

This document records the implemented system and the user's approved dark brand direction. The surface contract belongs in `.impeccable/surfaces/home.md`; current validation evidence and remaining limits belong in `VERIFICATION.md`.

## Colors

The interface follows Relay Kit's dark palette; chain colors remain spatial identifiers within the miniature. The frontmatter is the normative local token snapshot, extracted from `src/style.css`, `src/journey-ui.css`, `src/activity.js`, and `src/environment.js`.

### Primary

- **Purple / Purple Hover:** the whale-flyover action and transaction link.
- **Accent Text / Accent Bright / Accent Surface:** active navigation, selected activity, train details, and origin/fill stages.
- **Focus:** the visible keyboard outline.

### Secondary

- **Success, Warning, Danger:** completed, waiting/blocked, and failed stage treatments. Warning Surface also distinguishes preview and simulation explanations.
- **Ethereum and Base:** district edges, station roofs, chain marks, and traveler identity in the displayed city. The broader chain palette remains in the token snapshot and chain registry; unsupported endpoints are excluded from this two-district view, with no visible neutral hub.
- **Tabletop, Lawn, Road, Sidewalk:** the physical model's ground layers and movement surfaces. Imported assets retain their recognizable materials and silhouettes.

### Neutral

- **Canvas:** header, footer, and scene background.
- **Paper / Surface / Hover:** floating panels, nested controls and signage, and interaction feedback.
- **Ink / Muted / White:** main labels, supporting copy, and text on purple actions.
- **Line:** panel dividers and inactive journey steps.

**The Stage Meaning Rule.** Stage color always accompanies a text label; police lights and checkpoint colors illustrate the reported outcome rather than establish transaction evidence.

Brand references: [Relay Kit base styles](https://github.com/relayprotocol/relay-kit/blob/main/packages/ui/src/styles/base.css), [Relay Kit theme](https://github.com/relayprotocol/relay-kit/blob/main/packages/ui/src/themes/RelayKitTheme.ts), and [Relay brand assets](https://docs.relay.link/resources/brand-assets). Asset provenance belongs in `ASSETS.md`.

## Typography

Inter is self-hosted as a variable TTF covering weights 100–900, with `font-display: swap`, sans-serif fallback, and font synthesis disabled. The header uses the official Relay wordmark asset with a separate Inter “City” label.

- **Display:** the city or focused district title, with responsive size overrides.
- **Title:** the guide heading. Trip amounts use a larger (27px) heading with tighter tracking.
- **Body:** guide paragraphs. Introductory copy is slightly larger (13px) with line height (1.75).
- **Label:** actions and values. Route names use compact (10px) semibold type; age and stage labels also use (10px).
- **Micro:** the preview/source badge. Footer captions use tracked uppercase styling.

Activity values, traffic status, and footer values use tabular numerals. In-world signs and route textures use the canvas sans-serif stack, independent of the DOM's Inter face. Dense labels remain a review concern; their presence is not an accessibility compliance claim.

## Layout

The desktop frame has an (88px) header, a scene sized to `100dvh - 160px` with a (420px) minimum height, and a (72px) footer. The scene clips overflow and positions the interface above a real orthographic 3D world.

The current city has two fixed, manually authored layouts. Ethereum has a larger, detailed street network, varied building heights and footprints, dense residential rows, distinct blocks, trees and grass pockets, a softly rounded uneven perimeter, and five ranked app sites. Base has a compact street plan and one app site. These proportions are design choices; sample counts do not resize land, roads, or buildings. Each district has one shared entrance/exit gate, connected by a neutral highway and sidewalks. Right-hand lanes, crossings, and two elevated rail lanes organize movement. Homes and app buildings supply actual journey addresses.

Ethereum is focused on startup. Clicking a district, its hovered name, or the selector isolates the neighborhood with border clipping, including roads, rails, traffic, and shadows. Clicking outside the district or **City overview** restores the shared view. The camera accounts for the surrounding controls when fitting the selected district. District names can also appear on territory hover. Focused activity separates incoming, outgoing, and local requests; same-chain trips belong only to Local.

The introduction and return-to-overview control sit upper left. Source, district selector, and flyover controls sit upper right, with the demo scenario selector beneath them. Activity occupies the left side in district focus and lower left in overview. Camera controls sit lower right, and the rail/queue/checkpoint readout occupies the lower center. Inspector and guide panels share the right side, with (310px) width and bounded scrolling. Projected district labels hide when they would overlap these overlays.

- At **1650px and wider**, overlays gain space and activity widens to (310px).
- At **1100px and narrower**, horizontal spacing tightens, the open-source caption hides, activity narrows to (258px), and traffic status moves above the camera controls.
- At **760px and narrower**, the header/footer become (72px)/(66px), source controls stack, and activity starts collapsed. Overview activity exposes at most three rows; the focused feed keeps its direction controls and scrolls within its available space. The scene uses `100dvh - 138px`; with traffic status present it has a (520px) minimum height and the page can scroll. Traffic status sits above the camera controls; activity moves above it. Inspector and guide move to the lower scene with bounded scrolling. Primary camera and close targets become (44px).
- At **430px and narrower**, the introduction becomes (26px), its width is constrained beside the controls, and the camera hint hides.
- At **620px high and shorter**, page scrolling remains available. At desktop widths and heights up to **800px**, the introduction becomes more compact and the camera hint hides.

The orthographic camera adapts to aspect ratio and zooms between (0.6–2.4). CSS responsibilities are split among `src/style.css` for tokens and base components, `src/journey-ui.css` for journey/operations additions, and `src/responsive.css` for responsive and reduced-motion rules.

## Elevation & Depth

The world uses real geometry, matte materials, soft shadows, lavender overhead light, and cool fill light. The tabletop has a rounded layered edge. Raised stations, rail supports, sidewalks, roofs, trees, and lamps make its miniature scale legible. Both imported and built scene materials use roughness (0.85).

Floating interface surfaces use the ambient shadow `0 3px 8px #00000024, 0 14px 38px #0000003d`. Projected district labels use `0 3px 9px #0000004d`. Panels remain opaque; the loading cover veils the scene until its models are ready. Shadow and motion extensions live in `.impeccable/design.json`.

## Shapes

Panels have (14px) rounded corners; toolbars (10px); select and primary-action shells (9px); activity rows (7px); stage chips (5px); and preview badges (4px). Circular chain marks sit in compact rectangular labels with a pointer. Fine dividers organize inspection details, while a three-column progress strip uses colored top rules to indicate journey stages.

Preserve the official Relay wordmark instead of reconstructing it from text or geometric bars. The city remains physical model geometry; its station roofs, houses, towers, and vehicles provide the signature shapes.

## Components

- **Native selects:** source and district selectors use native select semantics inside dark shells. A separate demo-only journey selector exposes city life, same-chain sprint, OpenSea Ethereum to Base, origin waiting, destination confirmation, failed, blocked, train queue, and sky-route examples.
- **Buttons and navigation:** primary actions use Purple with Purple Hover; secondary actions use tonal surfaces. Buttons press to scale (0.96), disabled controls use opacity (0.45), and keyboard focus uses a (3px) outline offset (4px). Active desktop navigation has an Accent Text bottom rule. The official wordmark links home.
- **Camera toolbar:** pause/resume, zoom in/out, and reset to city overview. A separate **City overview** button appears in district focus. Pause exposes `aria-pressed` with an Accent Surface selected treatment. Arrows/WASD pan, Q/E rotate, and +/− zoom. Drag orbits, right-drag/two-finger gestures pan, and scrolling zooms. Keyboard navigation yields to native controls and help, and clears on lost focus. District focus animates when reduced motion is not requested.
- **Activity panel:** overview shows four recent rows on desktop, with three visible on mobile. District focus offers up to twelve rows in a bounded scrolling feed, with **All**, **In**, **Out**, and **Local** buttons and direction counts. Incoming and outgoing trips exclude same-chain trips. Both endpoints must be Ethereum or Base in live and demo data; unsupported routes are excluded without changing their real chain identities. Rows are semantic buttons with route, direction/app-stage text, value, accessible name, and selected state. Its heading toggles the body; the skip link expands the body before focusing the list.
- **Inspector and guide:** mutually exclusive panels distinguish the API stage from the city's animated phase, show attribution and pace source, and provide route/value details. Real entries link to Relay; demo entries state that no funds moved. Close and Escape restore focus to the visible opener, with the activity heading as fallback.
- **District addresses:** Ethereum has five fixed named app sites in descending height order: Fun, LI.FI, Fomo, MetaMask, OKX. The dated available-history ranking and verified namespaces are documented in INTEGRATORS.md. Base has one observed app site. Driveway and terminal paving stops flush at the outer sidewalk edge. Both have separate no-garage pedestrian homes and garage-equipped car homes for Relay, app commons, a bus terminal, a larger police station, and a rail station. Buses use terminal addresses. Other ground integrator trips use their named building when matched, otherwise the commons. Missing referrers remain unknown. Same-chain journeys select a stable local loop variation and return to the same starting address. No unsupported chain is assigned to these addresses. Referrer attribution is not verified app ownership.
- **Ground journeys and checkpoints:** each district's single gate carries incoming and outgoing ground traffic on directional lanes. Pedestrians follow sidewalks and crossings; road vehicles use lanes and signals. A same-chain pedestrian uses the actual `sprint` clip on a local loop; other pedestrians select it when measured or estimated duration is at most (15 seconds), otherwise they use `walk`. Pending crosschain ground trips wait in off-lane border checkpoints with separate pedestrian and vehicle aisles. Ethereum has four holding spaces per type and Base has two; overflow remains tracked off-scene. Unresolved trips conservatively reserve both endpoints until confirmed or physically clear after a failure; confirmed trips pass without a timed toll wait. Destination-stage ground trips await confirmation in the destination gate bay, rejoin on completion, and use a destination escort or tow if they subsequently fail. Unresolved same-chain arrivals also wait in the destination gate bay. Pedestrians pass through one another to avoid sidewalk deadlocks; vehicles retain signals and following gaps. Live origin-to-fill progression follows normalized API evidence; completed requests replay their journey. Failure/refund paths return; `BLOCKED` and `BLOCKED_WALLET` ground outcomes use a playful police boarding/escort or tow illustration to the district police station. This does not assert enforcement or a literal location of funds.
- **Rail journeys:** two physically separate lanes carry opposite directions, with one train allowed per lane and additional eligible trips queued. A train enters through the rear yard/tunnel, stops at its origin and destination stations, then exits through the yard. Only confirmed-success train-sized requests animate; pending/failed/refunded requests do not spawn trains. The operations readout shows lane occupancy, queue count, and waiting checkpoints; releasing checkpoints is a demo-only action.
- **Flight journeys:** chain compass bearings define sky routes independently of district coordinates. Airplanes and trains carry origin/destination identity marks and route labels. Airplanes and the flyover control appear only in overview. The demo-only whale flyover creates and selects an illustrative large transfer.
- **Motion and recovery:** interface transitions last (160ms); the loading cube alternates over (1.3s). Reduced-motion preferences remove CSS animation/transitions and start traffic paused. The pause control remains available; a deliberate flyover resumes demo traffic. Camera damping belongs to direct manipulation. Empty, loading, and error states remain explicit; if the canvas or models fail, the activity list remains the text entry point.

## Do's and Don'ts

### Do:

- **Do** preserve the user's colorful miniature world, actual model silhouettes, and approved Relay dark branding.
- **Do** design districts individually, beginning with Ethereum, and make street structure, building scale, and density visible within the focused neighborhood.
- **Do** keep source scope, chain identity, attribution, and API stage readable outside the canvas.
- **Do** retain native controls, visible focus, pause, and reduced-motion behavior.
- **Do** reuse the existing panel, radius, and shadow vocabulary.

### Don't:

- **Don't** replace the modeled city with an image or decorative interface cards.
- **Don't** promote sample counts or sample value to global daily statistics.
- **Don't** describe route animation, gate waits, police escorts, or travel speed as literal settlement evidence.
- **Don't** treat isolated browser captures as exhaustive visual or accessibility verification.
