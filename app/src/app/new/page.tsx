"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  BriefSchema,
  VIBE_ALLOWLIST,
  DEADLINE_PRESETS,
  MUST_HAVES_MAX,
  COLORS_MAX,
  DEFAULT_MIN_SCORE,
  type Brief,
} from "@/lib/agents/schema";
import { hash } from "@/lib/hash";
import {
  type ExtraField,
  type FormSpec,
  type InterviewTurn,
} from "@/lib/agents/form-spec";
import { BriefInterview, type InterviewResult } from "@/components/BriefInterview";
import { buildCreateBountyIx, findBountyPda, getProgram } from "@/lib/solana/client";
import devnetConfig from "@/config/devnet.json";

const AGENTS = ["minimal", "bold", "luxe"] as const;

export default function NewBountyPage() {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [businessName, setBusinessName] = useState("");
  const [whatItDoes, setWhatItDoes] = useState("");
  const [audience, setAudience] = useState("");
  const [vibe, setVibe] = useState<string[]>([]);
  const [avoid, setAvoid] = useState("");
  const [mustHaves, setMustHaves] = useState<string[]>([]);
  const [mustHaveDraft, setMustHaveDraft] = useState("");
  const [visualDirection, setVisualDirection] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [colorDraft, setColorDraft] = useState("#34d399");
  const [inspiration, setInspiration] = useState("");
  const [minScore, setMinScore] = useState(DEFAULT_MIN_SCORE);
  const [prizeTusdc, setPrizeTusdc] = useState(10);
  const [deadlinePreset, setDeadlinePreset] = useState<keyof typeof DEADLINE_PRESETS>("demo");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Every bounty: interview first, then a form generated for this mission.
  // There is no generic form — spec is null until the interview builds one.
  const [phase, setPhase] = useState<"interview" | "form">("interview");
  const [spec, setSpec] = useState<FormSpec | null>(null);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [extraAnswers, setExtraAnswers] = useState<Record<string, string | string[]>>({});

  function startForm(result: InterviewResult) {
    setSpec(result.spec);
    setCategory(result.category);
    setTurns(result.turns);
    setExtraAnswers({});
    setPhase("form");
    window.scrollTo({ top: 0 });
  }

  function setExtra(field: ExtraField, value: string) {
    setExtraAnswers((prev) => {
      if (field.kind !== "multichoice") return { ...prev, [field.id]: value };
      const current = Array.isArray(prev[field.id]) ? (prev[field.id] as string[]) : [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [field.id]: next };
    });
  }

  /** Interview answers + the tailored questions the buyer answered — the
   * context agents design from and the referee judges fit by. */
  function buildDetails(): Brief["details"] {
    const fromForm = (spec?.extraFields ?? [])
      .map((f) => {
        const v = extraAnswers[f.id];
        const answer = Array.isArray(v) ? v.join(", ") : (v ?? "").trim();
        return { question: f.label.slice(0, 200), answer: answer.slice(0, 500) };
      })
      .filter((d) => d.answer.length > 0);
    const all = [...turns, ...fromForm].slice(0, 12);
    return all.length > 0 ? all : undefined;
  }

  function toggleVibe(v: string) {
    setVibe((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].slice(0, 5)));
  }

  function addMustHave() {
    const item = mustHaveDraft.trim().slice(0, 120);
    if (!item || mustHaves.length >= MUST_HAVES_MAX || mustHaves.includes(item)) return;
    setMustHaves((prev) => [...prev, item]);
    setMustHaveDraft("");
  }

  function addColor() {
    const hex = colorDraft.toLowerCase();
    if (colors.length >= COLORS_MAX || colors.includes(hex)) return;
    setColors((prev) => [...prev, hex]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!publicKey) {
      setError("Connect your wallet first.");
      return;
    }

    const parsed = BriefSchema.safeParse({
      businessName,
      whatItDoes,
      audience,
      vibe,
      avoid: avoid.trim() || undefined,
      mustHaves: mustHaves.length > 0 ? mustHaves : undefined,
      visualDirection: visualDirection.trim() || undefined,
      colors: colors.length > 0 ? colors : undefined,
      inspiration: inspiration.trim() || undefined,
      minScore,
      category,
      details: buildDetails(),
      prizeTusdc,
      deadlinePreset,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid brief");
      return;
    }
    const brief: Brief = parsed.data;

    setSubmitting(true);
    try {
      const program = getProgram(connection);
      const preset = DEADLINE_PRESETS[deadlinePreset];
      const nowSecs = Math.floor(Date.now() / 1000);
      const deadline = nowSecs + preset.deadlineSecs;
      const bountyId = BigInt(Date.now());
      const briefHash = hash(brief);
      const mint = new PublicKey(devnetConfig.mint);

      const ix = await buildCreateBountyIx(program, {
        buyer: publicKey,
        mint,
        bountyId,
        amount: brief.prizeTusdc * 1_000_000,
        deadline,
        pickWindowSecs: preset.pickWindowSecs,
        briefHash: Buffer.from(briefHash, "hex"),
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash }).add(ix);
      const txSig = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, "confirmed");

      const [bountyPda] = findBountyPda(publicKey, bountyId, program.programId);

      const registerRes = await fetch("/api/bounties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: bountyPda.toBase58(), txSig, brief }),
      });
      const registerJson = await registerRes.json();
      if (!registerRes.ok) {
        throw new Error(registerJson.error ?? "Failed to register bounty");
      }

      const bountyRowId: string = registerJson.id;

      for (const agent of AGENTS) {
        fetch(`/api/bounties/${bountyRowId}/run/${agent}`, { method: "POST" }).catch(() => {});
      }

      router.push(`/b/${bountyRowId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (phase === "interview" || spec === null) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Post a bounty</h1>
        <p className="mb-8 text-sm text-stone-500">
          Tell us what you need — we&apos;ll build a form made for your bounty.
        </p>
        <BriefInterview onComplete={startForm} />
      </main>
    );
  }

  const c = spec.core;
  const vibeOrder = [
    ...spec.suggestedVibes,
    ...VIBE_ALLOWLIST.filter((v) => !spec.suggestedVibes.includes(v)),
  ];
  const mustHaveSuggestions = spec.suggestedMustHaves.filter((m) => !mustHaves.includes(m));

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12">
      <div className="mb-8 flex flex-col gap-2">
        {category && <span className="text-xs uppercase tracking-wider text-accent">{category}</span>}
        <h1 className="text-2xl font-semibold tracking-tight">{spec.title}</h1>
        {spec.intro && <p className="text-sm text-stone-600">{spec.intro}</p>}
        <button
          type="button"
          onClick={() => setPhase("interview")}
          className="self-start text-xs text-stone-500 underline hover:text-stone-700"
        >
          ← Redo the questions
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Field label={c.businessName.label}>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            maxLength={60}
            required
            className="input"
            placeholder={c.businessName.placeholder}
          />
        </Field>

        <Field label={c.whatItDoes.label} hint={c.whatItDoes.help || undefined}>
          <textarea
            value={whatItDoes}
            onChange={(e) => setWhatItDoes(e.target.value)}
            maxLength={300}
            required
            rows={3}
            className="input"
            placeholder={c.whatItDoes.placeholder}
          />
        </Field>

        <Field label={c.audience.label} hint={c.audience.help || undefined}>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            maxLength={200}
            required
            className="input"
            placeholder={c.audience.placeholder}
          />
        </Field>

        {spec.extraFields.length > 0 && (
          <fieldset className="flex flex-col gap-6 rounded-2xl border border-stone-200 p-5">
            <legend className="px-2 text-xs uppercase tracking-wider text-stone-500">About your bounty</legend>
            {spec.extraFields.map((f) => (
              <Field key={f.id} label={f.label} hint={f.help || undefined}>
                {f.kind === "text" && (
                  <input
                    value={(extraAnswers[f.id] as string | undefined) ?? ""}
                    onChange={(e) => setExtra(f, e.target.value)}
                    maxLength={500}
                    className="input"
                    placeholder={f.placeholder}
                  />
                )}
                {f.kind === "longtext" && (
                  <textarea
                    value={(extraAnswers[f.id] as string | undefined) ?? ""}
                    onChange={(e) => setExtra(f, e.target.value)}
                    maxLength={500}
                    rows={3}
                    className="input"
                    placeholder={f.placeholder}
                  />
                )}
                {(f.kind === "choice" || f.kind === "multichoice") && (
                  <div className="flex flex-wrap gap-2">
                    {f.options.map((o) => {
                      const v = extraAnswers[f.id];
                      const on = Array.isArray(v) ? v.includes(o) : v === o;
                      return (
                        <button
                          type="button"
                          key={o}
                          onClick={() => setExtra(f, o)}
                          className={`rounded-full border px-3 py-1 text-sm transition ${
                            on ? "border-accent bg-accent/10 text-accent" : "border-stone-200 text-stone-600 hover:border-stone-300"
                          }`}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Field>
            ))}
          </fieldset>
        )}

        <Field
          label="Vibe (up to 5)"
          hint={spec.suggestedVibes.length > 0 ? "✦ marks the ones we suggest for you — you choose." : undefined}
        >
          <div className="flex flex-wrap gap-2">
            {vibeOrder.map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => toggleVibe(v)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  vibe.includes(v)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-stone-200 text-stone-600 hover:border-stone-300"
                }`}
              >
                {spec.suggestedVibes.includes(v) && "✦ "}
                {v}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label={`Must-have checklist (optional, up to ${MUST_HAVES_MAX})`}
          hint="Each item is scored on its own. Add them one by one."
        >
          {mustHaves.length > 0 && (
            <ul className="flex flex-col gap-2">
              {mustHaves.map((item) => (
                <li
                  key={item}
                  className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-accent">✓</span>
                    <span className="break-words">{item}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setMustHaves((prev) => prev.filter((x) => x !== item))}
                    className="shrink-0 text-stone-500 hover:text-stone-800"
                    aria-label={`Remove "${item}"`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {mustHaves.length < MUST_HAVES_MAX && (
            <div className="flex gap-2">
              <input
                value={mustHaveDraft}
                onChange={(e) => setMustHaveDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addMustHave();
                  }
                }}
                maxLength={120}
                className="input flex-1"
                placeholder="e.g. a teapot in the logo"
              />
              <button
                type="button"
                onClick={addMustHave}
                className="rounded-full border border-stone-300 px-4 text-sm text-stone-800 hover:border-stone-500"
              >
                Add
              </button>
            </div>
          )}
          {mustHaveSuggestions.length > 0 && mustHaves.length < MUST_HAVES_MAX && (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-stone-500">Suggested for your bounty — tap to add:</span>
              <div className="flex flex-wrap gap-2">
                {mustHaveSuggestions.map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() =>
                      setMustHaves((prev) => (prev.length < MUST_HAVES_MAX && !prev.includes(m) ? [...prev, m] : prev))
                    }
                    className="rounded-full border border-dashed border-stone-300 px-3 py-1 text-left text-xs text-stone-700 hover:border-accent hover:text-accent"
                  >
                    + {m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>

        <Field label={c.avoid.label} hint="Anything here that shows up in a kit is penalized.">
          <input
            value={avoid}
            onChange={(e) => setAvoid(e.target.value)}
            maxLength={200}
            className="input"
            placeholder={c.avoid.placeholder}
          />
        </Field>

        <Field label={c.visualDirection.label} hint="Scored: does the kit look the way you describe?">
          <textarea
            value={visualDirection}
            onChange={(e) => setVisualDirection(e.target.value)}
            maxLength={300}
            rows={2}
            className="input"
            placeholder={c.visualDirection.placeholder}
          />
          <div className="flex flex-wrap items-center gap-2">
            {colors.map((hex) => (
              <button
                type="button"
                key={hex}
                onClick={() => setColors((prev) => prev.filter((col) => col !== hex))}
                className="flex items-center gap-2 rounded-full border border-stone-200 py-1 pl-1 pr-3 text-xs text-stone-700 hover:border-stone-400"
                aria-label={`Remove color ${hex}`}
              >
                <span className="h-5 w-5 rounded-full" style={{ backgroundColor: hex }} />
                {hex} ✕
              </button>
            ))}
            {colors.length < COLORS_MAX && (
              <span className="flex items-center gap-2">
                <input
                  type="color"
                  value={colorDraft}
                  onChange={(e) => setColorDraft(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-stone-200 bg-transparent"
                  aria-label="Pick a color"
                />
                <button
                  type="button"
                  onClick={addColor}
                  className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-800 hover:border-stone-500"
                >
                  Add color
                </button>
              </span>
            )}
          </div>
        </Field>

        <Field label={c.inspiration.label} hint="Ideas the agents may use — not required, and never scored.">
          <textarea
            value={inspiration}
            onChange={(e) => setInspiration(e.target.value)}
            maxLength={500}
            rows={3}
            className="input"
            placeholder={c.inspiration.placeholder}
          />
        </Field>

        <Field
          label={`Minimum match to pass: ${minScore}%`}
          hint="Entries scoring below this are marked Failed. You can still pick a failed entry."
        >
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </Field>

        <Field label="Prize (tUSDC)">
          <input
            type="number"
            min={1}
            max={1000}
            value={prizeTusdc}
            onChange={(e) => setPrizeTusdc(Number(e.target.value))}
            required
            className="input"
          />
        </Field>

        <Field label="Timing">
          <div className="flex gap-2">
            {(Object.keys(DEADLINE_PRESETS) as Array<keyof typeof DEADLINE_PRESETS>).map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setDeadlinePreset(p)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  deadlinePreset === p
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-stone-200 text-stone-600 hover:border-stone-300"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !publicKey}
          className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {!publicKey ? "Connect wallet to continue" : submitting ? "Creating…" : "Create bounty"}
        </button>
      </form>
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  // A labelled group, not a <label>: several fields hold more than one
  // control (list + input + button), and a <label> would forward clicks to
  // the first one.
  const labelId = useId();
  const hintId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={hint ? hintId : undefined}
      className="flex flex-col gap-2"
    >
      <span id={labelId} className="text-xs uppercase tracking-wider text-stone-500">
        {label}
      </span>
      {hint && (
        <span id={hintId} className="-mt-1 text-xs text-stone-500">
          {hint}
        </span>
      )}
      {children}
    </div>
  );
}
