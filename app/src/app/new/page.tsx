"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  BriefSchema,
  VIBE_ALLOWLIST,
  DEADLINE_PRESETS,
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
  const [prizeTusdc, setPrizeTusdc] = useState(10);
  const [deadlinePreset, setDeadlinePreset] = useState<keyof typeof DEADLINE_PRESETS>("demo");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleVibe(v: string) {
    setVibe((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].slice(0, 5)));
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
      avoid: avoid || undefined,
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

        <Field label="Avoid (optional)">
          <input
            value={avoid}
            onChange={(e) => setAvoid(e.target.value)}
            maxLength={200}
            className="input"
            placeholder="nothing cartoonish, no neon"
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
