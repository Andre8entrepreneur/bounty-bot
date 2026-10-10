"use client";

import { useState, type FormEvent } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSession } from "./SessionProvider";
import { WalletButton } from "./WalletButton";
import {
  MAX_INTERVIEW_TURNS,
  MIN_INTERVIEW_TURNS,
  WORK_CATEGORIES,
  type FormSpec,
  type InterviewTurn,
  type NextQuestion,
} from "@/lib/agents/form-spec";

export interface InterviewResult {
  spec: FormSpec;
  category: string;
  turns: InterviewTurn[];
}

type Phase = "category" | "thinking" | "asking" | "building";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Guided intake: broad category first, then AI questions that narrow down,
 * then a form generated for this mission (the buyer fills it in after). */
export function BriefInterview({
  onComplete,
  onSkip,
}: {
  onComplete: (result: InterviewResult) => void;
  onSkip: () => void;
}) {
  const { connected } = useWallet();
  const { signedIn, signIn, signingIn } = useSession();
  const [phase, setPhase] = useState<Phase>("category");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [current, setCurrent] = useState<NextQuestion | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);

  async function ask(cat: string, sofar: InterviewTurn[]) {
    setPhase("thinking");
    setError(null);
    try {
      setCurrent(await postJson<NextQuestion>("/api/brief/next", { category: cat, turns: sofar }));
      setPhase("asking");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setRetry(() => () => ask(cat, sofar));
    }
  }

  async function build(cat: string, sofar: InterviewTurn[]) {
    setPhase("building");
    setError(null);
    try {
      const res = await postJson<{ spec: FormSpec; category: string }>("/api/brief/form", {
        category: cat,
        turns: sofar,
      });
      onComplete({ spec: res.spec, category: res.category, turns: sofar });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setRetry(() => () => build(cat, sofar));
    }
  }

  function answer(text: string) {
    const value = text.trim().slice(0, 400);
    if (!value || !current || !categoryId) return;
    const next = [...turns, { question: current.question.slice(0, 200), answer: value }];
    setTurns(next);
    setDraft("");
    if (next.length >= MAX_INTERVIEW_TURNS || (current.done && next.length >= MIN_INTERVIEW_TURNS)) {
      void build(categoryId, next);
    } else {
      void ask(categoryId, next);
    }
  }

  function submitDraft(e: FormEvent) {
    e.preventDefault();
    answer(draft);
  }

  function restart() {
    setPhase("category");
    setCategoryId(null);
    setTurns([]);
    setCurrent(null);
    setDraft("");
    setError(null);
  }

  const skipLink = (
    <button onClick={onSkip} className="text-sm text-zinc-500 underline hover:text-zinc-300">
      Skip — fill the form myself
    </button>
  );

  if (!signedIn) {
    return (
      <section className="flex flex-col items-start gap-4 rounded-2xl border border-zinc-800 p-6">
        <h2 className="text-lg font-semibold">Let&apos;s figure out what you need</h2>
        <p className="text-sm text-zinc-400">
          A few quick questions, then we build a form made for your mission. Sign in with your
          wallet first — it&apos;s a free signature, not a transaction.
        </p>
        {connected ? (
          <button
            onClick={signIn}
            disabled={signingIn}
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50"
          >
            {signingIn ? "Check Phantom…" : "Sign in"}
          </button>
        ) : (
          <WalletButton />
        )}
        {skipLink}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-zinc-800 p-6">
      {phase === "category" && (
        <>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">What do you need done?</h2>
            <p className="text-sm text-zinc-500">We start broad, then narrow it down together.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {WORK_CATEGORIES.map((c) => (
              <button
                key={c.id}
                disabled={!c.available}
                onClick={() => {
                  setCategoryId(c.id);
                  void ask(c.id, []);
                }}
                className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 px-4 py-3 text-left text-sm transition enabled:hover:border-accent/60 enabled:hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-zinc-100">{c.label}</span>
                {!c.available && (
                  <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                    Coming soon
                  </span>
                )}
              </button>
            ))}
          </div>
          {skipLink}
        </>
      )}

      {phase !== "category" && (
        <>
          {turns.length > 0 && (
            <ol className="flex flex-col gap-2 border-b border-zinc-800 pb-4 text-sm">
              {turns.map((t, i) => (
                <li key={i} className="flex flex-col">
                  <span className="text-zinc-500">{t.question}</span>
                  <span className="text-zinc-200">{t.answer}</span>
                </li>
              ))}
            </ol>
          )}

          {error ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-red-400">{error}</p>
              <div className="flex gap-3">
                {retry && (
                  <button onClick={retry} className="rounded-full border border-zinc-700 px-4 py-2 text-sm hover:border-zinc-500">
                    Try again
                  </button>
                )}
                {skipLink}
              </div>
            </div>
          ) : phase === "thinking" ? (
            <p className="animate-pulse text-sm text-zinc-400">Thinking of the next question…</p>
          ) : phase === "building" ? (
            <p className="animate-pulse text-sm text-zinc-400">Building a form made for your mission…</p>
          ) : (
            current && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wider text-zinc-500">
                    Question {turns.length + 1} of up to {MAX_INTERVIEW_TURNS}
                  </span>
                  <h2 className="text-lg font-semibold text-zinc-100">{current.question}</h2>
                </div>
                {current.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {current.suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => answer(s)}
                        className="rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-accent hover:text-accent"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <form onSubmit={submitDraft} className="flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={400}
                    className="input flex-1"
                    placeholder="Or type your own answer"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="rounded-full bg-accent px-5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40"
                  >
                    Next
                  </button>
                </form>
                <div className="flex flex-wrap items-center gap-4">
                  {turns.length >= MIN_INTERVIEW_TURNS && categoryId && (
                    <button
                      onClick={() => void build(categoryId, turns)}
                      className="text-sm text-accent underline hover:brightness-110"
                    >
                      That&apos;s enough — build my form
                    </button>
                  )}
                  <button onClick={restart} className="text-sm text-zinc-500 underline hover:text-zinc-300">
                    Start over
                  </button>
                  {skipLink}
                </div>
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}
