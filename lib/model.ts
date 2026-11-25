// LaunchLens's value model: one snapshot in, one ranked board out.
//
// Design rule: every number the model uses comes from the snapshot's own ten fields. No protocol name
// is ever looked up, no winner is hand-picked. The same pure function scores every rankable protocol.
//
//   implied = max(1, round(
//       tvl_usd * BASE
//     * growthMult        // seven-day TVL change, clamped
//     * maturityMult      // how long it has run with no token on record
//     * chainMult         // chain diversity, from chains.length
//     * categoryMult      // risk tier of the snapshot's category field
//   ))
//
// Constants are stated in MODEL, printed verbatim in the dashboard, and reproduced by the page's own
// impliedOf() so page and board visibly agree. Pre-token protocols are ranked; protocols whose record
// already carries a token are set aside for the "already trading" view, never mixed into the ranking.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Every tunable constant of the model, as the dashboard prints it. */
export interface ModelConstants {
  base_multiple: number;
  growth_clamp: number;
  growth_weight: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_weight: number;
  risk_low: number;
  risk_mid: number;
  risk_high: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_clamp: 60,
  growth_weight: 0.6,
  maturity_floor: 0.7,
  maturity_range: 0.5,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_weight: 0.1,
  risk_low: 0.75,
  risk_mid: 1.0,
  risk_high: 1.25,
};

export const MODEL_VERSION = 'lens-1';
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;

/** A farm step: a concrete action, an explicit dollar cost and a time. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_count: number;
    chain_multiplier: number;
    category_mult: number;
    category_tier: string;
    category_why: string;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row (the farm plan is regenerated in the page). */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  chain_count: number;
  implied_value_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  category_mult: number;
}

/** A live-token protocol: its market cap is a fact, not a model. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The dataset window.LAUNCHLENS carries to the page. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * Category risk as a generic keyword rule over the snapshot's category field, never a name list.
 * Commodity-like categories (bridges, staking, stablecoins, RWA, basis) get a conservative multiple;
 * speculative, capital-intensive ones (derivatives, leveraged farming, curators) a higher one.
 * The rule returns the actual constant so the value can never drift from the stated model.
 */
export function categoryRisk(category: string | null, model: ModelConstants): { mult: number; tier: string; why: string } {
  const c = (category ?? '').toLowerCase();
  if (/liquid staking|liquid restaking|restaked|staking|stable|bridge|canonical|cex|basis|insurance|rwa|wrapped/.test(c)) {
    return { mult: model.risk_low, tier: 'conservative', why: 'commodity-like activity gets a conservative multiple' };
  }
  if (/derivat|leveraged|perpetual|options|prediction|curator|allocator|onchain capital|risk/.test(c)) {
    return { mult: model.risk_high, tier: 'speculative', why: 'capital-intensive activity gets a speculative premium' };
  }
  return { mult: model.risk_mid, tier: 'standard', why: 'the standard multiple applies' };
}

/** The complete factor breakdown and implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants) {
  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_clamp, Math.max(-model.growth_clamp, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainCount = protocol.chains.length;
  const chainMult = 1 + model.chain_weight * Math.log(1 + chainCount);
  const risk = categoryRisk(protocol.category, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * model.base_multiple * growthMult * maturityMult * chainMult * risk.mult));
  return { implied, growthPct, growthMult, maturityMult, chainCount, chainMult, categoryMult: risk.mult, categoryTier: risk.tier, categoryWhy: risk.why, age };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The snapshot records no token for this protocol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Rankable: no token on record, not a centralised exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest implied value first, ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_count: s.chainCount,
      chain_multiplier: round4(s.chainMult),
      category_mult: s.categoryMult,
      category_tier: s.categoryTier,
      category_why: s.categoryWhy,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** One string with the action, an explicit dollar cost and its time, inside the gate's 20..600 window. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Budget $0 and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and borrow a small amount against it.`;
  if (c.includes('dex') || c.includes('liquidity') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of two-sided liquidity to ${name}'s main pool on ${chain} and keep the receipt.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in one of its apps.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's liquid staking asset through ${name} and keep the receipt token.`;
  if (c.includes('derivat') || c.includes('perpetual') || c.includes('option')) return `Deposit $${capital} of USDC as margin on ${name} and open one small, fully collateralised position.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position on ${name}, then let it settle before exiting.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and record the share price on entry.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold the position.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s onchain yield asset on ${chain} and hold it to accrue yield.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * Eight concrete steps, each with an explicit dollar cost and a time, derived from the protocol's
 * category, chains, TVL and age. No name is special-cased: only those four fields choose the actions.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const small = Math.max(5, Math.round(capital / 5));
  const gas = capital >= 150 ? 8 : 4;
  const action = actionFor(p, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Open a dedicated wallet for this farm on ${chain}, fund it with $${capital} of USDC plus about $${gas} for gas, and store its seed phrase offline.`,
      cost: `$${capital} of USDC and about $${gas} of gas`,
      time: '6 minutes',
    },
    {
      text: `Confirm the official ${p.name} app and contract address from the protocol's own documentation before you approve any token spend.`,
      cost: '$0 to verify, plus a $1 gas test approval',
      time: '5 minutes',
    },
    { text: action, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes' },
    {
      text: `Repeat one small $${small} action each week, such as a deposit, a borrow, a swap or a governance vote, so the wallet shows sustained use.`,
      cost: `about $2 of gas a week on ${chain}`,
      time: '10 minutes a week',
    },
  ];
  if (p.chains.length > 1) {
    steps.push({
      text: `${p.name} runs on ${p.chains.length} chains. Bridge $${small} to ${p.chains[1]} and repeat one action there so activity is not limited to ${chain}.`,
      cost: `$${small} of capital and about $3 of bridge fees`,
      time: '12 minutes',
    });
  } else {
    steps.push({
      text: `Keep all farm activity on ${chain}, the only chain ${p.name} records in the snapshot, and avoid third-party wrappers that add counterparty risk.`,
      cost: '$0 extra, using the gas already budgeted',
      time: '2 minutes',
    });
  }
  steps.push(
    {
      text: `Hold the position for at least ${hold} days so the activity lands in more than one eligibility snapshot rather than a single day.`,
      cost: `the $${capital} stays locked in the position`,
      time: `${hold} days`,
    },
    {
      text: `When you are ready to exit, open ${p.name}'s own points or rewards page and claim only from the link the protocol publishes, never from a message.`,
      cost: '$0 to check, and pay no claim fee at all',
      time: '10 minutes',
    },
    {
      text: 'Log the wallet address, the dates, each transaction hash and the gas spent so the position can be repeated or unwound with an exact record.',
      cost: '$0 for the log itself',
      time: '5 minutes',
    },
  );
  return steps;
}

/** The live-token protocols by market cap, for the separate "already trading" view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    chain_count: row.model.chain_count,
    implied_value_usd: row.implied_value_usd,
    growth_pct: row.model.growth_pct,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    category_mult: row.model.category_mult,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** Parse and shape-check the snapshot. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is refused by the gate, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i}`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'all rows share one implied value';
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.LAUNCHLENS=${JSON.stringify(radar)};\n`;
}
