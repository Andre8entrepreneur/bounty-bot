// Real numbers and a real finished mission for the landing page. Read with
// the anon client (public SELECT only), like the rest of the public pages.
import { getSupabaseBrowserClient } from "./supabase/browser";
import { agentDisplayLabel, personaLabel } from "./agents/display-names";
import { WINNER_SHARE } from "./cost-estimate";

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
  brief: { businessName?: string } | null;
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

function toDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/** The latest awarded mission with at least 3 scored, previewable entries. */
export async function getShowcase(): Promise<Showcase | null> {
  const supabase = getSupabaseBrowserClient();
  const { data: bounties } = await supabase
    .from("bounties")
    .select("id,brief,amount,winner_agent,settle_tx")
    .eq("status", "awarded")
    .order("created_at", { ascending: false })
    .limit(6)
    .returns<ShowcaseBounty[]>();

  for (const bounty of bounties ?? []) {
    const { data: rows } = await supabase
      .from("entries")
      .select("agent_key,agent_pubkey,referee_score,referee_pass,kit")
      .eq("bounty_id", bounty.id)
      .not("referee_score", "is", null)
      .returns<ShowcaseRow[]>();
    const usable = (rows ?? []).filter((r) => r.kit?.logoSvg && r.referee_score !== null);
    if (usable.length < 3) continue;

    const pubkeys = usable.filter((r) => !r.agent_key && r.agent_pubkey).map((r) => r.agent_pubkey as string);
    const { data: named } = pubkeys.length
      ? await supabase.from("agents").select("agent_pubkey,name").in("agent_pubkey", pubkeys).returns<Array<{ agent_pubkey: string; name: string }>>()
      : { data: [] };
    const nameByPubkey = new Map((named ?? []).map((a) => [a.agent_pubkey, a.name]));

    const entries = usable
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
        palette: (r.kit?.palette ?? []).map((p) => p.hex ?? "").filter((hex) => /^#[0-9a-fA-F]{6}$/.test(hex)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return {
      bountyId: bounty.id,
      businessName: bounty.brief?.businessName ?? "A real mission",
      prizeTusdc: (bounty.amount ?? 0) / 1_000_000,
      settleTx: bounty.settle_tx,
      entries,
    };
  }
  return null;
}
