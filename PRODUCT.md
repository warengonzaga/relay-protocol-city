# Relay City

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Three.js with real GLB models, native JavaScript/CSS, Vite, and a small Node API proxy.

## Users

Relay Protocol community members and curious visitors exploring crosschain activity.

## Product Purpose

Make Relay activity tangible and entertaining through a miniature city. Chains are districts; app attribution chooses the house or integrator building for both ends of a journey.

## Capabilities and Constraints

Two manually authored, fixed layouts: Ethereum is the first detailed neighborhood; Base is a compact connection point. Street plans, building sizes, and parcels are designed directly rather than generated from activity counts. Ethereum has five ranked, fixed named app sites (Fun, LI.FI, Fomo, MetaMask, OKX) based on the available historical snapshot in INTEGRATORS.md; Base has one observed app site; additional or unknown apps use each district's commons. Each district has one gate for incoming and outgoing ground traffic, off-lane checkpoints with separate pedestrian/vehicle spaces (four of each in Ethereum, two of each in Base), pedestrian homes without garages, car homes with garages, a bus terminal, a larger police station, and a rail stop. Ethereum combines dense housing and mixed-height buildings with trees, grass pockets, and a rounded uneven perimeter. A neutral highway and sidewalks connect the two gates.

Ethereum is focused by default. Clicking a district, its hovered name, or the selector isolates that neighborhood at its polygon border. Clicking outside it or **City overview** returns to both districts. Arrows/WASD pan, Q/E rotate, and +/− zoom. The focused activity feed separates incoming, outgoing, and local trips. Both live and demo scenes include only routes whose two endpoints are Ethereum or Base. Unsupported endpoints are excluded, never remapped.

One traveler represents one request, with pedestrian/car/bus/truck/train/airplane selected by input USD value. Sidewalks, garages, signals, two opposite rail lines, destination-bearing flights, and police/tow illustrations support the journeys. Buses travel terminal to terminal. Integrator cars and NPCs use their app building. Same-chain trips take a varied local loop and return to their exact origin; pedestrians sprint for same-chain or short measured/estimated timing.

Only successful train-sized requests animate. Airplanes appear only in city overview. Destination-pending ground trips wait at the destination gate; completion releases them and a later failure triggers a destination escort or tow. Live scenes advance only from available API stage evidence. Missing updates retain pending state. Completed requests replay, and positions are stage metaphors rather than exact fund locations. App attribution preserves unknown values. Integrator visibility and nonterminal requests may be owner-scoped. No global daily totals are available. A server-side v3 key is still required for production; the anonymous v2 local preview is temporary.

## Brand Commitments

Name: Relay City. Keep the user's colorful toy-like modeled city, now in a nighttime environment with Relay's official dark design-system colors, Inter typography, and white Relay wordmark. Models remain legible against the dark backdrop.

## Evidence on Hand

Official Relay Requests docs, the chain registry, Relay Kit dark theme source, licensed GLB models, authored district plans, and automated lifecycle/route tests. Current validation evidence and remaining limits belong in `VERIFICATION.md`. Network-wide pending visibility remains unverified.

## Product Principles

Design districts individually, beginning with Ethereum. Make building size, street structure, and neighborhood density visible at a useful close scale. Keep Base as a small connection point while its neighborhood awaits a separate design pass. Make rare large transfers memorable without overstating data coverage. Expose illustrative scenarios separately from live data. Preserve accessible list-based inspection, keyboard controls, pause, and reduced motion.
