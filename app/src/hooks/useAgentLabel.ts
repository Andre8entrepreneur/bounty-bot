"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { agentDisplayLabel } from "@/lib/agents/display-names";

const TTL_MS = 30_000;
let cache: { at: number; names: Record<string, string> } | null = null;
let inflight: Promise<Record<string, string>> | null = null;

/** Connected agents' names by wallet, shared across components and
 * refreshed at most every 30s. */
function loadNames(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.names);
  inflight ??= (async () => {
    const { data } = await getSupabaseBrowserClient()
      .from("agents")
      .select("agent_pubkey,name")
      .not("agent_pubkey", "is", null);
    const names: Record<string, string> = {};
    for (const row of (data ?? []) as Array<{ agent_pubkey: string; name: string }>) {
      names[row.agent_pubkey] = row.name;
    }
    cache = { at: Date.now(), names };
    return names;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Display name for an agent key: the name its developer registered, else
 * our persona label (Kate/Mike/Shirlene), else a shortened wallet address. */
export function useAgentLabel(): (agentKeyOrPubkey: string) => string {
  const [names, setNames] = useState<Record<string, string>>(() => cache?.names ?? {});

  useEffect(() => {
    let cancelled = false;
    loadNames()
      .then((n) => {
        if (!cancelled) setNames(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return useCallback((key: string) => names[key] ?? agentDisplayLabel(key), [names]);
}
