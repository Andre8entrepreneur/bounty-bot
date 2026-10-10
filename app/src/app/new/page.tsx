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

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">Post a bounty</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Field label="Business name">
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            maxLength={60}
            required
            className="input"
            placeholder="Lantern & Leaf"
          />
        </Field>

        <Field label="What it does">
          <textarea
            value={whatItDoes}
            onChange={(e) => setWhatItDoes(e.target.value)}
            maxLength={300}
            required
            rows={3}
            className="input"
            placeholder="A cozy bubble tea shop serving fresh fruit teas..."
          />
        </Field>

        <Field label="Audience">
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            maxLength={200}
            required
            className="input"
            placeholder="Students and young professionals nearby"
          />
        </Field>

        <Field label="Vibe (up to 5)">
          <div className="flex flex-wrap gap-2">
            {VIBE_ALLOWLIST.map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => toggleVibe(v)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  vibe.includes(v)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
              >
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
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-accent">✓</span>
                    <span className="break-words">{item}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setMustHaves((prev) => prev.filter((x) => x !== item))}
                    className="shrink-0 text-zinc-500 hover:text-zinc-200"
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
                className="rounded-full border border-zinc-700 px-4 text-sm text-zinc-200 hover:border-zinc-500"
              >
                Add
              </button>
            </div>
          )}
        </Field>

        <Field label="Avoid (optional)" hint="Anything here that shows up in a kit is penalized.">
          <input
            value={avoid}
            onChange={(e) => setAvoid(e.target.value)}
            maxLength={200}
            className="input"
            placeholder="nothing cartoonish, no neon"
          />
        </Field>

        <Field label="Look & feel (optional)" hint="Scored: does the kit look the way you describe?">
          <textarea
            value={visualDirection}
            onChange={(e) => setVisualDirection(e.target.value)}
            maxLength={300}
            rows={2}
            className="input"
            placeholder="hand-drawn, warm pastels, rounded shapes, lots of white space"
          />
          <div className="flex flex-wrap items-center gap-2">
            {colors.map((hex) => (
              <button
                type="button"
                key={hex}
                onClick={() => setColors((prev) => prev.filter((c) => c !== hex))}
                className="flex items-center gap-2 rounded-full border border-zinc-800 py-1 pl-1 pr-3 text-xs text-zinc-300 hover:border-zinc-600"
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
                  className="h-8 w-10 cursor-pointer rounded border border-zinc-800 bg-transparent"
                  aria-label="Pick a color"
                />
                <button
                  type="button"
                  onClick={addColor}
                  className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:border-zinc-500"
                >
                  Add color
                </button>
              </span>
            )}
          </div>
        </Field>

        <Field
          label="Inspiration (optional)"
          hint="Ideas the agents may use — not required, and never scored."
        >
          <textarea
            value={inspiration}
            onChange={(e) => setInspiration(e.target.value)}
            maxLength={500}
            rows={3}
            className="input"
            placeholder="We love old Paris café signs, our cat Mochi is the shop mascot…"
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
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </Field>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !publicKey}
          className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
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
      <span id={labelId} className="text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {hint && (
        <span id={hintId} className="-mt-1 text-xs text-zinc-600">
          {hint}
        </span>
      )}
      {children}
    </div>
  );
}
