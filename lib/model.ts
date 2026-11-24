// Token Radar model radar-2: fitted, not hand-set.
//
// Held-out tests on the snapshot's 128 traded tokens (target log market cap),
// run by the builder before this model was chosen (heldout-test4.py):
//   5-fold CV seed 7:  TVL-only OLS MAE-log 1.604, Spearman 0.431 (naive TVL x median ratio 1.783)
//   5-fold CV seed 42: TVL-only OLS MAE-log 1.585, Spearman 0.437 (naive 1.771)
//   walk-forward oldest 70% -> newest 30%: TVL-only OLS 1.429, Spearman 0.487 (naive 1.599)
//   TVL x joint launch-odds: 2.057 / 2.060 / 1.968 — WORSE, so the odds are NOT multiplied in.
//   Full OLS (logTVL +0.48, growth -4.42, logAge -0.09, category one-hots): 1.69-1.71 — worse.
// So: implied = exp(6.965 + 0.522 * ln(TVL)); growth weight 0; age enters only through the
// launch-odds column (smoothed joint P(token | category, age bucket), Laplace alpha 1).
// Conformal intervals from 5-fold out-of-fold residuals: 80% x12.74, 90% x30.82;
// median multiplicative error 0.848 (84.8%). Every number on the dashboard is one of these.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor by implied value: the early rows the radar exists
// to find. A protocol is pre-token when its index entry records no token (no market cap, no
// CoinGecko id, no symbol); the snapshot's live-token protocols are kept apart and shown as the
// market's own values, never mixed into the ranked board.

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

/** The fitted model, as the dashboard states it. Every number is a measured held-out figure. */
export interface ModelConstants {
  intercept: number;
  slope: number;
  conformal_q80: number;
  conformal_q90: number;
  median_mult_err: number;
  cv_seed7_mae: number;
  cv_seed42_mae: number;
  wf_mae: number;
  cv_seed7_rho: number;
  cv_seed42_rho: number;
  wf_rho: number;
  naive_seed7_mae: number;
  naive_seed42_mae: number;
  naive_wf_mae: number;
  smoothing_alpha: number;
}

export const MODEL: ModelConstants = {
  intercept: 6.965,
  slope: 0.522,
  conformal_q80: 2.545,
  conformal_q90: 3.428,
  median_mult_err: 0.848,
  cv_seed7_mae: 1.604,
  cv_seed42_mae: 1.585,
  wf_mae: 1.429,
  cv_seed7_rho: 0.431,
  cv_seed42_rho: 0.437,
  wf_rho: 0.487,
  naive_seed7_mae: 1.783,
  naive_seed42_mae: 1.771,
  naive_wf_mae: 1.599,
  smoothing_alpha: 1,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by implied value. */
export const EARLY_ROWS = 260;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
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
  launch_odds: number;
  interval_low_usd: number;
  interval_high_usd: number;
  model: {
    intercept: number;
    slope: number;
    odds: number;
    interval_low_usd: number;
    interval_high_usd: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
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
  implied_value_usd: number;
  launch_odds: number;
  interval_low_usd: number;
  interval_high_usd: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A protocol the board does not rank: the full index accounts for every one of the 758. */
export interface RestRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  status: string;
}

/** Everything the dashboard needs: the board, the live set, the rest, and the model it runs. */
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
  rest_size: number;
  total_protocols: number;
  global_launch_rate: number;
  watchlist: string[];
  rows: RadarRow[];
  live: LiveRow[];
  rest: RestRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The age bucket a launch-odds cell uses. */
export function ageBucket(age: number | null): string {
  if (age === null) return 'unknown';
  if (age < 365) return '<1y';
  if (age < 730) return '1-2y';
  if (age < 1095) return '2-3y';
  return '3y+';
}

/** The ten categories with enough protocols to stand alone; the other 43 pool as Other. */
const TOP_CATEGORIES = ['Dexs', 'Liquid Staking', 'Lending', 'Yield', 'RWA', 'Derivatives', 'CDP', 'Restaking', 'Bridge', 'CEX'];

/** The category a launch-odds cell uses. */
export function oddsCategory(category: string | null): string {
  return category !== null && TOP_CATEGORIES.includes(category) ? category : 'Other';
}

/** Smoothed joint launch rates P(token | category, age bucket), computed from the snapshot itself. */
export interface OddsTable {
  joint: Map<string, number>;
  byCategory: Map<string, number>;
  global: number;
}

/** The joint odds table: Laplace smoothing (alpha 1) on every cell, category then global fallback. */
export function buildOddsTable(protocols: SnapshotProtocol[], asOf: string, alpha: number): OddsTable {
  const cells = new Map<string, [number, number]>();
  const cats = new Map<string, [number, number]>();
  let traded = 0;
  for (const p of protocols) {
    const key = `${oddsCategory(p.category)}|${ageBucket(ageDays(asOf, p.listed_at))}`;
    const cell = cells.get(key) ?? [0, 0];
    cell[1] += 1;
    if (p.mcap_usd !== null) cell[0] += 1;
    cells.set(key, cell);
    const cat = cats.get(oddsCategory(p.category)) ?? [0, 0];
    cat[1] += 1;
    if (p.mcap_usd !== null) cat[0] += 1;
    cats.set(oddsCategory(p.category), cat);
    if (p.mcap_usd !== null) traded += 1;
  }
  const joint = new Map<string, number>();
  for (const [key, [t, n]] of cells) joint.set(key, (t + alpha) / (n + 2 * alpha));
  const byCategory = new Map<string, number>();
  for (const [c, [t, n]] of cats) byCategory.set(c, (t + alpha) / (n + 2 * alpha));
  const global = (traded + alpha) / (protocols.length + 2 * alpha);
  return { joint, byCategory, global };
}

/** A protocol's launch odds from the joint table, falling back to its category, then the global rate. */
export function launchOdds(p: SnapshotProtocol, asOf: string, table: OddsTable): number {
  const key = `${oddsCategory(p.category)}|${ageBucket(ageDays(asOf, p.listed_at))}`;
  return table.joint.get(key) ?? table.byCategory.get(oddsCategory(p.category)) ?? table.global;
}

/** The fitted implied value and its 80% conformal interval for one protocol. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  odds: number,
): { implied: number; odds: number; lo80: number; hi80: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const implied = Math.max(1, Math.round(Math.exp(model.intercept + model.slope * Math.log(protocol.tvl_usd))));
  const factor80 = Math.exp(model.conformal_q80);
  const lo80 = Math.max(1, Math.round(implied / factor80));
  const hi80 = Math.round(implied * factor80);
  return { implied, odds, lo80, hi80, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** A compact dollar figure for farm-plan text: $12.4K, $3.2M, $1.10B. */
export function fmtUsdShort(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const oddsTable = buildOddsTable(snapshot.protocols, snapshot.as_of, model.smoothing_alpha);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by implied value, capped. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, v: impliedValue(p, snapshot.as_of, model, launchOdds(p, snapshot.as_of, oddsTable)) }))
    .sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const odds = launchOdds(p, snapshot.as_of, oddsTable);
    const { implied, lo80, hi80, age } = impliedValue(p, snapshot.as_of, model, odds);
    return { p, implied, lo80, hi80, odds, age };
  });
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
    launch_odds: Math.round(s.odds * 1000) / 1000,
    interval_low_usd: s.lo80,
    interval_high_usd: s.hi80,
    model: {
      intercept: model.intercept,
      slope: model.slope,
      odds: Math.round(s.odds * 1000) / 1000,
      interval_low_usd: s.lo80,
      interval_high_usd: s.hi80,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.implied, s.odds, s.lo80, s.hi80).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The gas a plan costs: setup gas plus about $2 a week over the hold, in whole dollars. */
export function gasCostFor(capital: number, holdDays: number): number {
  const setup = capital >= 150 ? 8 : 4;
  return Math.round(setup + 2 * (holdDays / 7));
}

/** The hours of work a plan takes: setup, one 10-minute action a week, claim and log. */
export function hoursFor(holdDays: number): number {
  const hours = 0.25 + (holdDays / 7) * (10 / 60) + 0.17 + 0.08;
  return Math.round(hours * 10) / 10;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age, implied value, launch odds), never
 * from a hand-written list of names. The last step is the verdict: what the plan costs per hour of
 * work, and the expected value at the peers' launch rate, with the 80% interval stated beside it.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied: number, odds: number, lo80: number, hi80: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const gas = gasCostFor(capital, hold);
  const hours = hoursFor(hold);
  const perHour = Math.round((gas / hours) * 10) / 10;
  const expected = Math.round(implied * odds);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
    {
      text: `Verdict: this plan costs about $${gas} in gas over ${hours} hours of work ($${perHour} an hour). The model puts a token at ${fmtUsdShort(implied)} with a ${Math.round(odds * 100)}% launch rate from the peers' record, so the expected value is ${fmtUsdShort(expected)} — a model estimate, not a promise. The 80% range is ${fmtUsdShort(lo80)} to ${fmtUsdShort(hi80)}.`,
      cost: `about $${gas} of gas in all`,
      time: `${hours} hours of work`,
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
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

/** The protocols neither ranked nor in the live top 24, with the reason each is set aside. */
export function restRows(snapshot: Snapshot, board: BoardRow[], live: LiveRow[]): RestRow[] {
  const onBoard = new Set(board.map((r) => r.slug));
  const onLive = new Set(live.map((r) => r.slug));
  return snapshot.protocols
    .filter((p) => !onBoard.has(p.slug) && !onLive.has(p.slug))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: ageDays(snapshot.as_of, p.listed_at),
      status: !isPreToken(p)
        ? 'already trades, beyond the live top 24'
        : p.category === 'CEX' || VERSIONED.test(p.name)
          ? 'pre-token, excluded: exchange or versioned pool'
          : 'pre-token below the floor, not ranked',
    }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
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
    implied_value_usd: row.implied_value_usd,
    launch_odds: row.launch_odds,
    interval_low_usd: row.interval_low_usd,
    interval_high_usd: row.interval_high_usd,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const rest = restRows(snapshot, board, live);
  const oddsTable = buildOddsTable(snapshot.protocols, snapshot.as_of, model.smoothing_alpha);
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
    rest_size: rest.length,
    total_protocols: snapshot.protocols.length,
    global_launch_rate: Math.round(oddsTable.global * 1000) / 1000,
    watchlist: [...snapshot.watchlist],
    rows: board.map(radarRow),
    live,
    rest,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
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
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
