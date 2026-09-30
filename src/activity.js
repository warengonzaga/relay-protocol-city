// IDs verified against Relay's /chains response; bearings describe sky routes only.
export const CHAIN_CONFIG = Object.freeze([
  {
    id: 8453,
    name: "Base",
    symbol: "BASE",
    color: "#2563eb",
    flightBearing: 0,
  },
  {
    id: 1,
    name: "Ethereum",
    symbol: "ETH",
    color: "#a394e8",
    flightBearing: 30,
  },
  {
    id: 792703809,
    name: "Solana",
    symbol: "SOL",
    color: "#36c6a0",
    flightBearing: 60,
  },
  {
    id: 42161,
    name: "Arbitrum",
    symbol: "ARB",
    color: "#5a9acb",
    flightBearing: 90,
  },
  {
    id: 10,
    name: "Optimism",
    symbol: "OP",
    color: "#ee5c66",
    flightBearing: 120,
  },
  {
    id: 137,
    name: "Polygon",
    symbol: "POL",
    color: "#9764d8",
    flightBearing: 150,
  },
  { id: 56, name: "BNB", symbol: "BNB", color: "#efb90b", flightBearing: 180 },
  {
    id: 43114,
    name: "Avalanche",
    symbol: "AVAX",
    color: "#e84142",
    flightBearing: 210,
  },
  {
    id: 8253038,
    name: "Bitcoin",
    symbol: "BTC",
    color: "#f7931a",
    flightBearing: 240,
  },
  {
    id: 130,
    name: "Unichain",
    symbol: "UNI",
    color: "#ff3d9a",
    flightBearing: 270,
  },
  {
    id: 999,
    name: "HyperEVM",
    symbol: "HYPE",
    color: "#6ee7c4",
    flightBearing: 300,
  },
  {
    id: 59144,
    name: "Linea",
    symbol: "LINEA",
    color: "#b6edee",
    flightBearing: 330,
  },
]);

export function getChain(id) {
  return (
    CHAIN_CONFIG.find((chain) => chain.id === Number(id)) ?? {
      id: Number(id),
      name: `Chain ${id}`,
      symbol: String(id),
      color: "#84949e",
      flightBearing: ((Number(id) % 360) + 360) % 360,
    }
  );
}

export const CITY_CHAIN_IDS = Object.freeze([1, 8453]);

export function getDistrictTrips(transfers, chainId = "all", direction = "all") {
  const id = Number(chainId);
  return transfers.filter(
    ({ originChainId: origin, destinationChainId: destination }) => {
      if (!CITY_CHAIN_IDS.includes(origin) || !CITY_CHAIN_IDS.includes(destination))
        return false;
      if (chainId !== "all" && origin !== id && destination !== id) return false;
      if (direction === "all") return true;
      if (direction === "local") return origin === destination;
      if (direction === "incoming") return destination === id && origin !== id;
      if (direction === "outgoing") return origin === id && destination !== id;
      return false;
    },
  );
}

export function classifyTransfer(amountUsd) {
  if (!Number.isFinite(amountUsd) || amountUsd < 100) return "pedestrian";
  if (amountUsd < 1_000) return "car";
  if (amountUsd < 10_000) return "bus";
  if (amountUsd < 100_000) return "truck";
  if (amountUsd < 1_000_000) return "train";
  return "airplane";
}

function parseUsd(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim()))
    return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function parseChainId(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const APP_NAMES = {
  opensea: "OpenSea",
  rainbow: "Rainbow",
  metamask: "MetaMask",
  phantom: "Phantom",
  lifi: "LI.FI",
  okx: "OKX",
  fomo: "Fomo",
  rango: "Rango",
  funxyz: "Fun",
  instaswap: "InstaSwap",
};

function getApp(referrer) {
  const unknown = { key: "unknown", name: "Unknown app", kind: "unknown" };
  if (typeof referrer !== "string") return unknown;
  // Referrers may append private correlation IDs. Only expose the app namespace.
  let key = referrer.split("|")[0].trim().toLowerCase();
  if (/^https?:\/\//.test(key)) {
    try {
      key = new URL(key).hostname;
    } catch {
      return unknown;
    }
  }
  if (
    !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(key) ||
    /^(?:0x)?[a-f0-9]{24,}$/i.test(key)
  )
    return unknown;
  if (key === "relay.link" || key === "www.relay.link")
    return { key: "relay", name: "Relay", kind: "relay" };
  if (key === "opensea.io" || key === "www.opensea.io") key = "opensea";
  // A quote's referrer is reported attribution, not verified app ownership.
  return { key, name: APP_NAMES[key] ?? key, kind: "integrator" };
}

function hasTransaction(tx) {
  return (
    typeof (tx?.txHash ?? tx?.hash) === "string" &&
    (tx.txHash ?? tx.hash).length > 0
  );
}

function transactionTime(tx) {
  return tx.status === "success" &&
    hasTransaction(tx) &&
    typeof tx.timestamp === "number" &&
    Number.isFinite(tx.timestamp) &&
    tx.timestamp > 0
    ? tx.timestamp
    : null;
}

function lifecycle(row, originChainId, destinationChainId) {
  const incoming = Array.isArray(row.data?.inTxs)
    ? row.data.inTxs.filter((tx) => tx && Number(tx.chainId) === originChainId)
    : [];
  const outgoing = Array.isArray(row.data?.outTxs)
    ? row.data.outTxs.filter(
        (tx) => tx && Number(tx.chainId) === destinationChainId,
      )
    : [];
  const depositConfirmed = incoming.some(
    (tx) => tx.status === "success" && hasTransaction(tx),
  );
  const fillSeen = outgoing.some(
    (tx) => hasTransaction(tx) && tx.status !== "failure",
  );
  const stage =
    row.status === "success"
      ? "complete"
      : row.status === "failure"
        ? "failed"
        : row.status === "refund"
          ? "refunded"
          : fillSeen
            ? "fill"
            : depositConfirmed
              ? "gate"
              : "origin";
  const starts = incoming
    .map(transactionTime)
    .filter((value) => value !== null);
  const finishes = outgoing
    .map(transactionTime)
    .filter((value) => value !== null);
  const measured =
    row.status === "success" && starts.length && finishes.length
      ? Math.max(...finishes) - Math.min(...starts)
      : null;
  const estimate = parseUsd(row.data?.timeEstimate);
  const durationSeconds =
    measured > 0 ? measured : estimate > 0 ? estimate : null;
  const speedSource =
    measured > 0 ? "measured" : estimate > 0 ? "estimated" : "unknown";
  const reason = row.data?.failReason;
  const failureReason =
    typeof reason === "string" && /^[A-Z][A-Z0-9_]{0,99}$/.test(reason)
      ? reason
      : null;
  return {
    status: row.status,
    stage,
    durationSeconds,
    speedSource,
    failureReason,
    blocked: failureReason === "BLOCKED" || failureReason === "BLOCKED_WALLET",
  };
}

const STATUSES = new Set([
  "pending",
  "waiting",
  "delayed",
  "depositing",
  "submitted",
  "success",
  "failure",
  "refund",
]);

export function normalizeRequest(row) {
  if (
    !STATUSES.has(row?.status) ||
    typeof row.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,160}$/.test(row.id)
  )
    return null;
  // Relay v3 uses route.actual; v2 stores the equivalent amounts in metadata.
  const route = row.data?.route;
  const actual = route?.actual;
  const quoted = route?.quoted;
  const input =
    actual?.origin?.inputCurrency ??
    quoted?.origin?.inputCurrency ??
    row.data?.metadata?.currencyIn;
  const output =
    actual?.destination?.outputCurrency ??
    quoted?.destination?.outputCurrency ??
    actual?.origin?.outputCurrency ??
    quoted?.origin?.outputCurrency ??
    row.data?.metadata?.currencyOut;
  const originChainId = parseChainId(input?.currency?.chainId);
  const destinationChainId = parseChainId(output?.currency?.chainId);
  const timestamp =
    typeof row.createdAt === "string" ? Date.parse(row.createdAt) : NaN;
  if (!originChainId || !destinationChainId || !Number.isFinite(timestamp))
    return null;
  const updated =
    typeof row.updatedAt === "string" ? Date.parse(row.updatedAt) : NaN;
  const origin = getChain(originChainId);
  const destination = getChain(destinationChainId);
  const amountUsd = parseUsd(input?.amountUsd);
  return {
    id: row.id,
    originChainId,
    destinationChainId,
    originName: origin.name,
    destinationName: destination.name,
    originSymbol: origin.symbol,
    destinationSymbol: destination.symbol,
    amountUsd,
    createdAt: new Date(timestamp).toISOString(),
    updatedAt: new Date(
      Number.isFinite(updated) ? updated : timestamp,
    ).toISOString(),
    url: `https://relay.link/transaction/${row.id}`,
    kind: classifyTransfer(amountUsd),
    app: getApp(row.data?.referrer ?? row.referrer),
    ...lifecycle(row, originChainId, destinationChainId),
  };
}

export function createDemoTransfers(count = 36, scenario = "all") {
  if (typeof count === "string") {
    scenario = count;
    count = 36;
  }
  const size = Number.isFinite(count)
    ? Math.max(0, Math.min(100, Math.floor(count)))
    : 36;
  const now = Date.now();
  const amounts = [
    24, 386, 2_450, 42, 18_600, 680, 7_240, 146_000, 62, 940, 2_480_000, 5_600,
  ];
  const refs = [
    "relay.link",
    "opensea",
    "rainbow",
    "relay.link",
    "metamask",
    "relay.link",
    "opensea",
    "relay.link",
    "opensea",
    "metamask",
    "relay.link",
    null,
  ];
  return Array.from({ length: size }, (_, index) => {
    const scenario = index % amounts.length;
    const origin = getChain(
      CITY_CHAIN_IDS[
        scenario === 1 ? 0 : (index + Math.floor(index / amounts.length)) % 2
      ],
    );
    const destination =
      scenario === 3 ? origin : getChain(origin.id === 1 ? 8453 : 1);
    const amountUsd =
      scenario === 5 && Math.floor(index / 12) === 1
        ? 38
        : scenario === 11 && Math.floor(index / 12) === 1
          ? 56
          : amounts[scenario];
    const demoScenario =
      scenario === 5
        ? "pending"
        : scenario === 8 || scenario === 9
          ? "blocked"
          : scenario === 11
            ? "failed"
            : "success";
    return {
      id: `demo-${index + 1}`,
      originChainId: origin.id,
      destinationChainId: destination.id,
      originName: origin.name,
      destinationName: destination.name,
      originSymbol: origin.symbol,
      destinationSymbol: destination.symbol,
      amountUsd,
      createdAt: new Date(now - index * 8_000).toISOString(),
      updatedAt: new Date(now).toISOString(),
      url: null,
      kind: classifyTransfer(amountUsd),
      app: getApp(refs[scenario]),
      status: "pending",
      stage: "origin",
      durationSeconds: scenario === 3 ? 1 : 2 + scenario * 2,
      speedSource: "estimated",
      failureReason: null,
      blocked: false,
      demoScenario,
    };
  }).filter((trip) => scenario === "all" || trip.demoScenario === scenario);
}
