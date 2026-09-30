import "./style.css";
import "./journey-ui.css";
import "./responsive.css";
import {
  CHAIN_CONFIG,
  CITY_CHAIN_IDS,
  createDemoTransfers,
  getChain,
  getDistrictTrips,
} from "./activity.js";
import { createCity } from "./city.js";
import { chainMark } from "./chain-marks.js";
import { icon, hydrateIcons } from "./icons.js";
import { activityEndpoint, assetUrl } from "./config.js";

const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});
const typeNames = {
  pedestrian: "Little commuter",
  car: "City car",
  bus: "Crosschain bus",
  truck: "Special delivery",
  train: "The chain express",
  airplane: "A whale on the move",
};
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobile = window.matchMedia("(max-width: 760px)");
let city;
let paused = motionPreference.matches;
let current = {
  mode: "demo",
  coverage: "sample",
  transfers: [],
  notice: "Loading city activity.",
};
let connectedSource;
let demoSource = {
  mode: "demo",
  coverage: "sample",
  transfers: createDemoTransfers(),
  notice:
    "This is an illustrative city. Demo trips replay continuously so you can explore all six kinds of traffic. Choose Relay activity to use the connected feed.",
};
let filter = "all";
let direction = "all";
let refreshTimer;
let toastTimer;
let disposed = false;
let selectedId;
let selectedTransfer;
let uiTimer;
let infoTrigger;
let tripTrigger;
hydrateIcons();

function matches(transfer) {
  return (
    filter === "all" ||
    transfer.originChainId === Number(filter) ||
    transfer.destinationChainId === Number(filter)
  );
}
function amount(value, compact = false) {
  return value === null
    ? "Value unavailable"
    : (compact ? compactMoney : money).format(value);
}
function chainBadge(id) {
  const chain = getChain(id);
  return `<span class="chain-symbol" style="background:${chain.color}">${chainMark(id)}</span>`;
}
function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 4200);
}
function restoreFocus(target) {
  const visible = target?.isConnected && target.getClientRects().length;
  (visible ? target : $("activity-toggle")).focus();
}
function showInfo(event) {
  if (!$("info-panel").hidden) return closeInfo();
  infoTrigger = event.currentTarget;
  $("info-panel").hidden = false;
  $("trip-inspector").hidden = true;
  $("close-info").focus();
}
function closeInfo() {
  $("info-panel").hidden = true;
  restoreFocus(infoTrigger);
}
function closeTrip() {
  $("trip-inspector").hidden = true;
  selectedId = null;
  city?.select(null);
  restoreFocus(tripTrigger);
}
function selectTrip(transfer) {
  tripTrigger =
    document.activeElement?.closest("button") || $("activity-toggle");
  selectedId = transfer.id;
  selectedTransfer = transfer;
  const content = $("trip-content");
  content.replaceChildren();
  const top = document.createElement("div");
  top.innerHTML = `<div class="inspector-vehicle">${icon(transfer.kind)}</div><h2 id="trip-title"></h2><p class="trip-type"></p><div class="inspector-route"><div>${chainBadge(transfer.originChainId)}<span></span></div>${icon("arrowRight")}<div>${chainBadge(transfer.destinationChainId)}<span></span></div></div><ol class="journey-steps"><li>Origin</li><li>Toll gate</li><li>Destination</li></ol><p id="trip-phase" class="stage-chip"></p><dl class="inspector-meta"><div><dt>API stage</dt><dd id="trip-source-stage"></dd></div><div><dt>App</dt><dd></dd></div><div><dt>Timing reference</dt><dd></dd></div><div><dt>Failure reason</dt><dd id="trip-failure"></dd></div><div><dt>Created</dt><dd></dd></div><div><dt>Data</dt><dd></dd></div></dl>`;
  top.querySelector("h2").textContent = amount(transfer.amountUsd);
  top.querySelector(".trip-type").textContent = typeNames[transfer.kind];
  const names = top.querySelectorAll(".inspector-route>div>span:last-child");
  names[0].textContent = transfer.originSymbol;
  names[1].textContent = transfer.destinationSymbol;
  const values = top.querySelectorAll("dd");
  values[0].textContent =
    current.mode === "demo" ? "Simulation" : stageName(transfer);
  values[1].textContent = transfer.app?.name ?? "Unknown app";
  values[2].textContent =
    transfer.originChainId === transfer.destinationChainId
      ? "Same-chain sprint"
      : transfer.durationSeconds
        ? `${transfer.durationSeconds}s · ${transfer.speedSource}`
        : "Default walking pace";
  values[3].textContent = transfer.failureReason ?? "None reported";
  values[4].textContent = new Date(transfer.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  values[5].textContent =
    current.mode === "demo" ? "Labeled simulation" : "Recent Relay sample";
  content.append(top);
  if (current.mode === "live" && transfer.url) {
    const link = document.createElement("a");
    link.className = "inspector-link";
    link.href = transfer.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = `View on Relay ${icon("arrowUpRight")}`;
    content.append(link);
  } else {
    const note = document.createElement("p");
    note.className = "inspector-demo";
    note.textContent =
      "A demo trip, made for exploring the city. No real funds were moved.";
    content.append(note);
  }
  $("trip-inspector").hidden = false;
  $("info-panel").hidden = true;
  city?.select(transfer.id);
  refreshOperations();
}

function stageName(transfer) {
  return (
    {
      origin: "Origin pending",
      gate: "Awaiting fill",
      fill: "Fill transaction seen",
      complete: "Completed",
      failed: "Failed",
      refunded: "Refunded",
    }[transfer.stage] ?? "Unknown stage"
  );
}
function refreshOperations() {
  if (!city) return;
  const stats = city.stats;
  $("rail-status").textContent =
    `Rail 1: ${stats.rails[0] ? "occupied" : "clear"} · Rail 2: ${stats.rails[1] ? "occupied" : "clear"}`;
  $("queue-status").textContent = `${stats.queued} queued`;
  $("gate-status").textContent = `${stats.gates} waiting at checkpoints`;
  $("release-gates").disabled = stats.gates === 0;
  if (!selectedId || $("trip-inspector").hidden) return;
  const inspected = city.inspect(selectedId);
  const transfer =
    inspected?.transfer ??
    current.transfers.find((t) => t.id === selectedId) ??
    selectedTransfer;
  const phase = inspected?.phase;
  const text =
    {
      depart: "Leaving the origin address",
      gate: "Waiting in the border inspection bay",
      "inspection-entry": "Pulling into the border inspection bay",
      rejoin: "Cleared · rejoining the through lane",
      "back-to-bay": "Returning to the inspection bay",
      onward: "Travelling to the destination",
      return: "Returning home",
      "back-to-gate": "Returning to the origin checkpoint",
      board: "Boarding the police vehicle",
      police: "Escorted to district police station",
      flight: "Following the chain compass",
      "rail-entry": "Tunnel → origin station",
      "rail-origin": "At the origin station",
      "rail-travel": "Origin → destination station",
      "rail-destination": "At the destination station",
      "rail-exit": "Returning to the rail-yard tunnel",
      "rail-return": "Returning to the origin station",
      "rail-returned": "Back at the origin station",
      "flight-return": "Returning after a failed flight",
      "flight-hold": "Circling while destination confirmation is pending",
      "flight-final": "Confirmed arrival · leaving the sky route",
      "arrival-wait": "At the destination, awaiting confirmation",
    }[phase] ?? "Not currently on the map";
  const stage = ["board", "police"].includes(phase)
    ? "blocked"
    : ["return", "back-to-gate", "back-to-bay"].includes(phase)
      ? "failed"
      : ["gate", "inspection-entry", "rejoin", "rail-origin"].includes(phase)
        ? "gate"
        : ["onward", "rail-travel", "rail-destination"].includes(phase)
          ? "fill"
          : "origin";
  const chip = $("trip-phase");
  if (chip) {
    chip.textContent = `${current.mode === "demo" ? "Simulation" : "City animation"}: ${inspected?.stopped ? "Waiting for road traffic" : text}`;
    chip.dataset.stage = stage;
  }
  const sourceStage = $("trip-source-stage");
  if (sourceStage)
    sourceStage.textContent =
      current.mode === "demo" ? "Illustrative scenario" : stageName(transfer);
  const reason = $("trip-failure");
  if (reason)
    reason.textContent =
      transfer.failureReason ??
      (current.mode === "demo" && transfer.demoScenario === "blocked"
        ? "BLOCKED_WALLET (simulated)"
        : current.mode === "demo" && transfer.demoScenario === "failed"
          ? "TRANSACTION_REVERTED (simulated)"
          : "None reported");
  document.querySelectorAll(".journey-steps li").forEach((step, index) => {
    const currentStep = stage === "fill" ? 2 : stage === "gate" ? 1 : 0;
    step.classList.toggle("active", index === currentStep);
    step.classList.toggle("complete", index < currentStep);
  });
}
function selectScenario() {
  const scenario = $("scenario").value;
  let transfers = createDemoTransfers();
  if (["pending", "failed", "blocked"].includes(scenario))
    transfers = transfers.filter((t) => t.demoScenario === scenario);
  else if (scenario === "same-chain")
    transfers = transfers.filter(
      (t) => t.originChainId === t.destinationChainId,
    );
  else if (scenario === "opensea")
    transfers = transfers.filter(
      (t) =>
        t.app?.key === "opensea" &&
        t.originChainId === 1 &&
        t.destinationChainId === 8453,
    );
  else if (scenario === "trains")
    transfers = transfers.filter((t) => t.kind === "train");
  else if (scenario === "airplanes")
    transfers = transfers.filter((t) => t.kind === "airplane");
  demoSource = { ...demoSource, transfers };
  selectedId = null;
  $("trip-inspector").hidden = true;
  applySource(true);
  if (
    ["pending", "failed", "blocked", "same-chain", "opensea"].includes(
      scenario,
    ) &&
    transfers[0]
  )
    focusDistrict(transfers[0].originChainId);
  else focusDistrict(filter);
}

function renderActivity() {
  const districtTransfers = getDistrictTrips(current.transfers, filter);
  const transfers = getDistrictTrips(current.transfers, filter, direction);
  $("district-directions").hidden = filter === "all";
  $("activity-heading").textContent =
    filter === "all" ? "City activity" : `${getChain(filter).name} activity`;
  for (const value of ["incoming", "outgoing", "local"])
    $(`${value}-count`).textContent = getDistrictTrips(
      current.transfers,
      filter,
      value,
    ).length;
  for (const button of $("district-directions").querySelectorAll("button"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.direction === direction),
    );
  const list = $("activity-list");
  const focusedId =
    document.activeElement?.closest("[data-transfer]")?.dataset.transfer;
  list.replaceChildren();
  for (const transfer of transfers.slice(0, filter === "all" ? 4 : 12)) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "trip-row";
    button.dataset.kind = transfer.kind;
    button.dataset.transfer = transfer.id;
    button.innerHTML = `<span class="vehicle-icon">${icon(transfer.kind)}</span><span><span class="trip-route"></span><span class="trip-age"></span></span><span class="trip-value"></span>`;
    const route = button.querySelector(".trip-route");
    route.append(document.createTextNode(transfer.originSymbol));
    const arrow = document.createElement("span");
    arrow.className = "route-arrow";
    arrow.textContent = "→";
    route.append(arrow, document.createTextNode(transfer.destinationSymbol));
    const journeyDirection =
      filter === "all"
        ? ""
        : transfer.originChainId === transfer.destinationChainId
          ? "Local · "
          : transfer.destinationChainId === Number(filter)
            ? "Incoming · "
            : "Outgoing · ";
    button.querySelector(".trip-age").textContent =
      journeyDirection +
      (current.mode === "demo"
        ? `${transfer.app?.name ?? "Unknown app"} · ${transfer.demoScenario ?? "success"} demo`
        : `${transfer.app?.name ?? "Unknown app"} · ${stageName(transfer)}`);
    button.querySelector(".trip-value").textContent = amount(
      transfer.amountUsd,
      true,
    );
    button.setAttribute(
      "aria-label",
      `${typeNames[transfer.kind]}, ${transfer.originName} to ${transfer.destinationName}, ${amount(transfer.amountUsd)}. View trip.`,
    );
    button.addEventListener("click", () => selectTrip(transfer));
    item.append(button);
    list.append(item);
    if (focusedId === transfer.id) button.focus({ preventScroll: true });
  }
  if (!transfers.length) {
    const empty = document.createElement("li");
    empty.className = "empty-feed";
    empty.textContent =
      direction === "all"
        ? "No Ethereum–Base or local trips in this sample yet."
        : `No ${direction} trips in this sample yet.`;
    list.append(empty);
  }
  $("trip-count").textContent = districtTransfers.length;
  const known = districtTransfers.filter((row) => row.amountUsd !== null);
  $("scene-volume").textContent = known.length
    ? compactMoney.format(known.reduce((sum, row) => sum + row.amountUsd, 0))
    : "—";
  $("chain-count").textContent = new Set(
    districtTransfers.flatMap((row) => [
      row.originChainId,
      row.destinationChainId,
    ]),
  ).size;
  $("volume-label").textContent =
    current.mode === "demo"
      ? "demo value"
      : known.length < districtTransfers.length
        ? "known sample value"
        : "sample value";
}

function renderMode() {
  const live = current.mode === "live";
  $("mode-label").textContent = live
    ? current.coverage === "integrator"
      ? "Live integrator sample"
      : "Live activity sample"
    : "Demo city · illustrative data";
  $("mode-label").parentElement.classList.toggle("live", live);
  $("feed-label").textContent = live ? "RECENT SAMPLE" : "PREVIEW";
  $("feed-note").textContent = live
    ? "Ethereum–Base and local trips only. Recent sample, not a daily total."
    : "Simulated Ethereum–Base and local trips. No real funds.";
  $("footer-mode").textContent = live ? "RECENT ACTIVITY" : "ILLUSTRATIVE CITY";
  $("data-explanation").textContent = [current.notice, current.trackingNotice]
    .filter(Boolean)
    .join(" ");
  $("simulation-controls").hidden = live;
  $("release-gates").hidden = live;
  const hasFlight = current.transfers.some(
    (transfer) => transfer.kind === "airplane" && matches(transfer),
  );
  $("whale-button").disabled = live || !hasFlight;
  $("whale-button").title = live
    ? "Whale flyovers happen when a large transfer arrives."
    : !hasFlight
      ? "Choose Sky routes or City life, with All chains, to preview a flight."
      : "Preview a whale-sized transfer";
}

async function loadActivity() {
  if (!activityEndpoint) {
    connectedSource = {
      ...demoSource,
      notice:
        "The live feed is not connected yet. This city shows illustrative demo transfers, not real Relay activity.",
    };
    applySource();
    return;
  }
  try {
    const tracked = city?.trackedIds ?? [];
    const query = tracked.length
      ? `?tracked=${encodeURIComponent(tracked.join(","))}`
      : "";
    const response = await fetch(`${activityEndpoint}${query}`, {
      credentials: "omit",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Feed unavailable");
    const data = await response.json();
    if (!["live", "demo"].includes(data.mode) || !Array.isArray(data.transfers))
      throw new Error("Invalid feed");
    connectedSource = data;
  } catch {
    connectedSource = {
      mode: "demo",
      coverage: "sample",
      updatedAt: new Date().toISOString(),
      transfers: createDemoTransfers(),
      notice:
        "Live activity is unavailable in this preview. These are illustrative transfers, not real Relay activity.",
    };
  }
  if (disposed) return;
  applySource();
  refreshTimer = setTimeout(loadActivity, 12000);
}

function applySource(reset = false) {
  current =
    $("data-view").value === "demo"
      ? demoSource
      : (connectedSource ?? demoSource);
  // Both endpoints must have an authored district. Never remap an unsupported chain.
  current = { ...current, transfers: getDistrictTrips(current.transfers) };
  renderMode();
  renderActivity();
  city?.setData(current.transfers, current.mode, reset);
  if (
    selectedId &&
    !city?.inspect(selectedId) &&
    !current.transfers.some((row) => row.id === selectedId)
  ) {
    $("trip-inspector").hidden = true;
    selectedId = null;
  }
}

function setPaused(value) {
  paused = value;
  city?.setPaused(paused);
  $("pause-button").innerHTML = icon(paused ? "play" : "pause");
  $("pause-button").setAttribute("aria-pressed", String(paused));
  $("pause-button").setAttribute(
    "aria-label",
    paused ? "Resume traffic" : "Pause traffic",
  );
  $("pause-button").title = paused ? "Resume traffic" : "Pause traffic";
}
function toggleActivity() {
  const expanded =
    $("activity-toggle").getAttribute("aria-expanded") === "true";
  $("activity-toggle").setAttribute("aria-expanded", String(!expanded));
  $("activity-body").hidden = expanded;
}
const tiers = [
  ["pedestrian", "Pedestrian", "Under $100"],
  ["car", "Car", "$100–$1k"],
  ["bus", "Bus", "$1k–$10k"],
  ["truck", "Truck", "$10k–$100k"],
  ["train", "Train", "$100k–$1m"],
  ["airplane", "Airplane", "$1m+"],
];
$("tier-guide").innerHTML = tiers
  .map(
    ([key, label, range]) =>
      `<div>${icon(key)}<span>${label}</span><span>${range}</span></div>`,
  )
  .join("");
const credits = document.createElement("p");
credits.className = "fine-print";
credits.innerHTML = `3D models by <a href="https://kenney.nl" target="_blank" rel="noopener noreferrer">Kenney</a>. Airplane and bus by Poly by Google, <a href="${assetUrl("models/poly-google/ATTRIBUTION.txt")}" target="_blank" rel="noopener noreferrer">CC BY 3.0 · credits</a>.`;
$("info-panel").append(credits);
$("how-button").addEventListener("click", showInfo);
$("legend-button").addEventListener("click", showInfo);
$("data-info").addEventListener("click", showInfo);
$("close-info").addEventListener("click", closeInfo);
$("close-inspector").addEventListener("click", closeTrip);
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  $("activity-toggle").setAttribute("aria-expanded", "true");
  $("activity-body").hidden = false;
  $("activity-list").focus();
  $("activity-list").scrollIntoView({ block: "nearest" });
});
function focusDistrict(id) {
  filter = id === "all" ? "all" : String(id);
  direction = "all";
  const focused = filter !== "all";
  $("chain-filter").value = filter;
  $("city-app").classList.toggle("district-focused", focused);
  $("back-to-city").hidden = !focused;
  $("city-title").textContent = focused ? getChain(filter).name : "Relay City";
  $("district-description").textContent = focused
    ? Number(filter) === 1
      ? "Our first hand-designed neighborhood."
      : "A connection point. Its neighborhood is next."
    : "Two districts. One shared highway. Click to explore.";
  $("trip-inspector").hidden = true;
  $("info-panel").hidden = true;
  selectedId = null;
  city?.select(null);
  city?.setFilter(filter);
  if (focused) city?.focusChain(filter);
  else city?.reset();
  renderActivity();
  renderMode();
}
for (const id of CITY_CHAIN_IDS) {
  const option = document.createElement("option");
  option.value = id;
  option.textContent = getChain(id).name;
  $("chain-filter").append(option);
}
$("city-tab").addEventListener("click", () => focusDistrict("all"));
$("back-to-city").addEventListener("click", () => focusDistrict("all"));
$("chain-filter").addEventListener("change", (event) =>
  focusDistrict(event.target.value),
);
$("district-directions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-direction]");
  if (!button) return;
  direction = button.dataset.direction;
  renderActivity();
});
$("data-view").addEventListener("change", () => {
  selectedId = null;
  $("trip-inspector").hidden = true;
  applySource(true);
});
$("scenario").addEventListener("change", selectScenario);
$("release-gates").addEventListener("click", () => city?.releasePending());
$("pause-button").addEventListener("click", () => setPaused(!paused));
$("zoom-in").addEventListener("click", () => city?.zoom(1.2));
$("zoom-out").addEventListener("click", () => city?.zoom(1 / 1.2));
$("reset-camera").addEventListener("click", () => focusDistrict("all"));
$("activity-toggle").addEventListener("click", toggleActivity);
$("whale-button").addEventListener("click", () => {
  if (current.mode !== "demo" || !city) return;
  let transfer = current.transfers.find(
    (row) => row.kind === "airplane" && matches(row),
  );
  if (!transfer) {
    toast("Choose All chains to preview the whale flyover.");
    return;
  }
  setPaused(false);
  city.flyover(transfer);
  selectTrip(transfer);
  toast("Look up. A demo whale is passing through.");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!$("info-panel").hidden) closeInfo();
    else if (!$("trip-inspector").hidden) closeTrip();
  }
});
motionPreference.addEventListener("change", (event) => {
  city?.setReducedMotion(event.matches);
  setPaused(event.matches);
});
if (mobile.matches) {
  $("activity-toggle").setAttribute("aria-expanded", "false");
  $("activity-body").hidden = true;
}
setPaused(paused);
$("flight-bearings").textContent = CHAIN_CONFIG.map(
  (chain) => `${chain.name} ${chain.flightBearing}°`,
).join(" · ");
uiTimer = setInterval(refreshOperations, 400);
await loadActivity();
try {
  city = await createCity(
    $("world"),
    $("chain-labels"),
    selectTrip,
    (error) => {
      $("scene-error").hidden = false;
      $("scene-error").querySelector("p").textContent = error.message;
    },
    {
      reducedMotion: motionPreference.matches,
      onFocusDistrict: focusDistrict,
    },
  );
  city.setPaused(paused);
  city.setData(current.transfers, current.mode);
  focusDistrict(1);
  $("loading-scene").hidden = true;
} catch (error) {
  console.error("Relay City:", error);
  $("loading-scene").hidden = true;
  $("scene-error").hidden = false;
  if (!/WebGL/i.test(error.message))
    $("scene-error").querySelector("p").textContent = error.message;
}

window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  disposed = true;
  clearTimeout(refreshTimer);
  clearTimeout(toastTimer);
  clearInterval(uiTimer);
  city?.dispose();
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    disposed = true;
    clearTimeout(refreshTimer);
    clearInterval(uiTimer);
    city?.dispose();
  });
