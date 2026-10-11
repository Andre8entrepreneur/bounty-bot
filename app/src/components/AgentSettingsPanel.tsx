"use client";

import { useState, type FormEvent } from "react";
import { AGENT_FIELDS, fieldLabel, type AgentFieldId } from "@/lib/agent-settings";
import { MODEL_PRICES } from "@/lib/cost-estimate";

export interface AgentSettingsValues {
  specialty: string | null;
  description: string | null;
  fields: string[] | null;
  model: string | null;
  min_bounty_tusdc: number | string | null;
  max_cost_pct: number | string | null;
  own_fields_only: boolean | null;
}

const numberOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));

/** One agent's settings: what it does, its fields, its model and when it
 * joins a bounty. The connector reads them within a minute of saving. */
export function AgentSettingsPanel({
  agentId,
  initial,
  onSaved,
}: {
  agentId: string;
  initial: AgentSettingsValues;
  onSaved: () => void;
}) {
  const [specialty, setSpecialty] = useState(initial.specialty ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [fields, setFields] = useState<string[]>(initial.fields ?? []);
  const [model, setModel] = useState(initial.model ?? "");
  const [minBounty, setMinBounty] = useState(initial.min_bounty_tusdc === null ? "" : String(initial.min_bounty_tusdc));
  const [maxCost, setMaxCost] = useState(initial.max_cost_pct === null ? "" : String(initial.max_cost_pct));
  const [ownFieldsOnly, setOwnFieldsOnly] = useState(initial.own_fields_only ?? false);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  function toggleField(id: AgentFieldId) {
    setState("idle");
    setFields((current) => (current.includes(id) ? current.filter((f) => f !== id) : [...current, id]));
  }

  const summary = [
    model ? MODEL_PRICES.find((m) => m.id === model)?.name : null,
    minBounty.trim() !== "" ? `bounties from ${minBounty} tUSDC` : null,
    maxCost.trim() !== "" ? `entry cost at most ${maxCost}% of the payout` : null,
    ownFieldsOnly && fields.length > 0 ? `only ${fields.map(fieldLabel).join(", ")}` : null,
  ].filter(Boolean);

  async function save(e: FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specialty: specialty.trim(),
          description: description.trim(),
          fields,
          model: model || null,
          minBountyTusdc: numberOrNull(minBounty),
          maxCostPct: numberOrNull(maxCost),
          ownFieldsOnly,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save the settings");
      setState("saved");
      onSaved();
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Could not save the settings");
    }
  }

  return (
    <form onSubmit={save} onChange={() => setState("idle")} className="flex flex-col gap-5 border-t border-stone-200 pt-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wider text-stone-500">Specialty, in one line</span>
          <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} maxLength={60} className="input" placeholder="Retro-editorial brand kits" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wider text-stone-500">Model it runs</span>
          <select value={model} onChange={(e) => setModel(e.target.value)} className="input">
            <option value="">Not set</option>
            {MODEL_PRICES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.provider} · {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="flex justify-between text-xs uppercase tracking-wider text-stone-500">
          What it specialises in
          <span className="normal-case tracking-normal tabular-nums">{description.length}/280</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={280}
          rows={3}
          className="input resize-y"
          placeholder="Warm, hand-drawn identities for independent restaurants and cafés, with names that are easy to say out loud."
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs uppercase tracking-wider text-stone-500">Fields it can take on</legend>
        <div className="flex flex-wrap gap-2">
          {AGENT_FIELDS.map((f) => {
            const on = fields.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleField(f.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-[background-color,border-color] duration-150 ${
                  on ? "border-ink bg-accent font-semibold text-on-accent" : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
                }`}
              >
                {on ? "✓ " : ""}
                {f.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-background/60 p-4">
        <legend className="px-1 text-xs uppercase tracking-wider text-stone-500">When it joins a bounty</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-stone-700">Minimum bounty (tUSDC)</span>
            <input value={minBounty} onChange={(e) => setMinBounty(e.target.value)} type="number" min={0} step="any" className="input" placeholder="No minimum" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-stone-700">Max entry cost (% of the payout)</span>
            <input value={maxCost} onChange={(e) => setMaxCost(e.target.value)} type="number" min={0.1} max={100} step="any" className="input" placeholder="No limit" />
          </label>
        </div>
        <p className="text-xs text-stone-500">
          The cost is estimated for each bounty from its brief, on the model above (or the priciest flagship if none is
          set), and compared with the 90% the winner receives.
        </p>
        <label className="flex items-center gap-2.5 text-sm text-stone-700">
          <input type="checkbox" checked={ownFieldsOnly} onChange={(e) => setOwnFieldsOnly(e.target.checked)} className="h-4 w-4 accent-[var(--ink)]" />
          Only join bounties in its fields
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={state === "saving"}
          className="rounded-full border-2 border-ink bg-accent px-5 py-2 text-sm font-semibold text-on-accent shadow-[3px_3px_0_var(--ink)] transition-[translate,box-shadow] duration-150 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--ink)] disabled:opacity-50"
        >
          {state === "saving" ? "Saving…" : "Save settings"}
        </button>
        <span className="text-xs text-stone-600">
          {state === "saved"
            ? "Saved ✓ — a running agent picks this up within a minute."
            : `Joins: ${summary.length ? summary.join(" · ") : "every bounty"}`}
        </span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
