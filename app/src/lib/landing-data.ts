// Real numbers and a real finished mission for the landing page. Read with
// the anon client (public SELECT only), like the rest of the public pages.
import { getSupabaseBrowserClient } from "./supabase/browser";
import { agentDisplayLabel, personaLabel } from "./agents/display-names";
import { WINNER_SHARE } from "./cost-estimate";
import { WORK_CATEGORIES } from "./agents/form-spec";

export interface LandingStats {
  missions: number;
  entries: number;
  paidTusdc: number;
  agents: number;
}

export interface ShowcaseEntry {
  label: string;
  score: number;
  pass: boolean;
  winner: boolean;
  logoDataUri: string;
  name: string;
  tagline: string;
  palette: string[];
}

export interface Showcase {
  bountyId: string;
  businessName: string;
  /** What the business does, from the buyer's brief. */
  summary: string;
  category: string;
  prizeTusdc: number;
  settleTx: string | null;
  entries: ShowcaseEntry[];
}

interface StatsBounty {
  status: string;
  amount: number | null;
}

interface ShowcaseBounty {
  id: string;
  brief: { businessName?: string; whatItDoes?: string; category?: string } | null;
  amount: number | null;
  winner_agent: string | null;
  settle_tx: string | null;
}

interface ShowcaseRow {
  agent_key: string | null;
  agent_pubkey: string | null;
  referee_score: number | null;
  referee_pass: boolean | null;
  kit: { logoSvg?: string; names?: string[]; tagline?: string; palette?: Array<{ hex?: string }> } | null;
}

export async function getLandingStats(): Promise<LandingStats> {
  const supabase = getSupabaseBrowserClient();
  const [bounties, entries] = await Promise.all([
    supabase.from("bounties").select("status,amount").returns<StatsBounty[]>(),
    supabase.from("entries").select("agent_pubkey").limit(5000).returns<Array<{ agent_pubkey: string | null }>>(),
  ]);
  const allBounties = bounties.data ?? [];
  const allEntries = entries.data ?? [];
  const paidMicro = allBounties
    .filter((b) => b.status === "awarded")
    .reduce((sum, b) => sum + (b.amount ?? 0), 0);
  return {
    missions: allBounties.length,
    entries: allEntries.length,
    paidTusdc: Math.round((paidMicro / 1_000_000) * WINNER_SHARE),
    agents: new Set(allEntries.map((e) => e.agent_pubkey).filter(Boolean)).size,
  };
}

/** Missions posted before categories existed are all brand identity missions. */
function categoryLabel(category: string | undefined): string {
  const known = WORK_CATEGORIES.find((c) => c.id === category || c.label === category);
  return (known ?? WORK_CATEGORIES[0]).label;
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/** A recent awarded mission with at least 3 scored, previewable entries.
 * Prefers one where the scores spread out and the buyer picked the top
 * score — it shows the referee actually telling entries apart — else the
 * most recent one. */
export async function getShowcase(): Promise<Showcase | null> {
  const supabase = getSupabaseBrowserClient();
  const { data: bounties } = await supabase
    .from("bounties")
    .select("id,brief,amount,winner_agent,settle_tx")
    .eq("status", "awarded")
    .order("created_at", { ascending: false })
    .limit(8)
    .returns<ShowcaseBounty[]>();
  if (!bounties || bounties.length === 0) return null;

  const { data: allRows } = await supabase
    .from("entries")
    .select("bounty_id,agent_key,agent_pubkey,referee_score,referee_pass,kit")
    .in("bounty_id", bounties.map((b) => b.id))
    .not("referee_score", "is", null)
    .returns<Array<ShowcaseRow & { bounty_id: string }>>();

  const candidates = bounties
    .map((bounty) => {
      const rows = (allRows ?? []).filter((r) => r.bounty_id === bounty.id && r.kit?.logoSvg);
      const scores = rows.map((r) => r.referee_score ?? 0);
      const isWinner = (r: ShowcaseRow) =>
        bounty.winner_agent !== null && (bounty.winner_agent === r.agent_key || bounty.winner_agent === r.agent_pubkey);
      const winner = rows.find(isWinner);
      const top = Math.max(...scores);
      const telling = winner !== undefined && winner.referee_score === top && top - Math.min(...scores) >= 5;
      return { bounty, rows, telling };
    })
    .filter((c) => c.rows.length >= 3);
  const chosen = candidates.find((c) => c.telling) ?? candidates[0];
  if (!chosen) return null;
  const { bounty, rows } = chosen;

  const pubkeys = rows.filter((r) => !r.agent_key && r.agent_pubkey).map((r) => r.agent_pubkey as string);
  const { data: named } = pubkeys.length
    ? await supabase.from("agents").select("agent_pubkey,name").in("agent_pubkey", pubkeys).returns<Array<{ agent_pubkey: string; name: string }>>()
    : { data: [] };
  const nameByPubkey = new Map((named ?? []).map((a) => [a.agent_pubkey, a.name]));

  const entries = rows
    .map((r): ShowcaseEntry => ({
      label: r.agent_key
        ? personaLabel(r.agent_key)
        : (nameByPubkey.get(r.agent_pubkey ?? "") ?? agentDisplayLabel(r.agent_pubkey ?? "")),
      score: r.referee_score ?? 0,
      pass: r.referee_pass === true,
      winner: bounty.winner_agent !== null && (bounty.winner_agent === r.agent_key || bounty.winner_agent === r.agent_pubkey),
      logoDataUri: toDataUri(r.kit?.logoSvg ?? ""),
      name: r.kit?.names?.[0] ?? "",
      tagline: r.kit?.tagline ?? "",
      palette: (r.kit?.palette ?? []).map((pal) => pal.hex ?? "").filter((hex) => /^#[0-9a-fA-F]{6}$/.test(hex)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    bountyId: bounty.id,
    businessName: bounty.brief?.businessName ?? "A real mission",
    summary: bounty.brief?.whatItDoes ?? "",
    category: categoryLabel(bounty.brief?.category),
    prizeTusdc: (bounty.amount ?? 0) / 1_000_000,
    settleTx: bounty.settle_tx,
    entries,
  };
}
