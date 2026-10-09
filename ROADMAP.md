# ROADMAP — Bounty Bot

`[you]` = André does it (accounts, wallet, secrets, eyes on the screen).
`[auto]` = Claude Code does it, including unattended overnight.
A box is ticked only when its **Done when** check passed in the current session (see CLAUDE.md).

| When | Bloc |
|---|---|
| Fri Oct 9, evening | Bloc 0 — infra & security (André + Claude Code, interactive) |
| Fri night | Blocs 1–3 — program, devnet, data, agents (unattended) |
| Sat Oct 10 | Bloc 4 — front end (Claude Code + André testing with Phantom) |
| Sat evening | Bloc 5 — README, demo seed, backup video, rehearsal |
| Sun Oct 11 | Demo |
| Mon Oct 12, 10:00 | Hacker House submission (Colosseum online deadline: Oct 12, 11:59pm PT) |

---

## Bloc 0 — Infra & security (interactive, ~90 min)

- [ ] **0.1 [you] Toolchain.**
  `curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash` → restart the terminal →
  `rustc --version && solana --version && anchor --version && node --version && yarn --version`.
  Then `brew install gitleaks jq supabase/tap/supabase`, and `claude update`.
- [ ] **0.2 [you] Accounts.**
  - GitHub: new **private** repo `bounty-bot` (it goes public only after the secret scan in 5.4).
  - Supabase: new project, region Tokyo or Singapore. Keep the URL, anon key, service-role key and DB password.
  - Anthropic Console: one API key for the app's agents. **Set a monthly spend limit (~$30).**
  - Vercel: account ready (import happens in 0.8).
- [ ] **0.3 [you] Wallets (devnet only).**
  ```bash
  solana config set --url devnet
  solana-keygen new                     # deployer → ~/.config/solana/id.json (skip if it already exists)
  mkdir -p ~/bounty-keys
  for k in platform agent-minimal agent-bold agent-luxe; do
    solana-keygen new --no-bip39-passphrase -o ~/bounty-keys/$k.json
  done
  solana address                        # paste into https://faucet.solana.com → aim for ~5 SOL
  solana balance
  ```
  Phantom: Settings → Developer settings → Testnet mode ON → Solana Devnet. Copy your address (= `DEMO_BUYER_ADDRESS`) and faucet ~1 SOL to it.
- [ ] **0.4 [you] Secrets.** `cp .env.example app/.env.local`, then fill it **in your own editor**. Never paste a value into Claude Code.
- [ ] **0.5 [you] Supabase CLI.** From the repo root: `supabase login`, then `supabase link --project-ref <your-ref>`.
- [ ] **0.6 [you] Git + guard rails** (Claude Code is not allowed to change the hook path, on purpose):
  `git init && git config core.hooksPath .githooks && chmod +x .githooks/pre-commit`.
  Then ask Claude Code to verify it: staging a dummy file named `.env.dummy` with `git add -f` must make `git commit` fail with the hook's message (then unstage and delete it), and a normal commit must pass.
- [ ] **0.7 [auto] Scaffold.** Anchor workspace in place (program name `escrow`), Next.js app in `app/` (TS strict, Tailwind, App Router, ESLint), `app/src/lib/env.ts` (zod, server vs public split), `check:env` script, home page showing "Bounty Bot — DEVNET".
  **Done when:** `anchor build` passes, `npm --prefix app run build` passes, `npm --prefix app run check:env` reports every variable as `set`.
- [ ] **0.8 [you] GitHub + Vercel.** Push. On Vercel: import the repo, Root Directory = `app`, add the `NEXT_PUBLIC_*` variables. (Server secrets come in 4.6.)
  **Done when:** the home page is live on `*.vercel.app` (open it with the VPN on).
- [ ] **0.9 [you] Overnight prep.** Laptop plugged in, VPN stable, sleep disabled (`caffeinate -dimsu &` in the terminal you launch from), and turn on auto-continue after a usage limit in Claude Code's `/config` if your version offers it.
  If Claude Code asks whether it may read files **outside the project folder**, answer "Yes, and keep allowing" so it never stalls overnight. Your keys stay protected by the deny rules in `.claude/settings.json`.

---

## Bloc 1 — Escrow program `[auto]`

### Spec

**Accounts**
- `Config` PDA `["config"]`: `admin: Pubkey` (platform authority), `treasury: Pubkey` (owner of the fee token account), `mint: Pubkey` (tUSDC), `fee_bps: u16` (= 1000), `bump`.
- `Bounty` PDA `["bounty", buyer, bounty_id.to_le_bytes()]`: `buyer`, `mint`, `bounty_id: u64`, `amount: u64`, `deadline: i64`, `pick_deadline: i64`, `brief_hash: [u8; 32]`, `status: Open | Awarded | Refunded`, `winner: Option<Pubkey>`, `entry_count: u8`, `bump`, `vault_bump`.
- Vault: token account PDA `["vault", bounty]`, authority = the Bounty PDA, mint = `config.mint`.
- `Entry` PDA `["entry", bounty, agent]`: `bounty`, `agent`, `content_hash: [u8; 32]`, `submitted_at: i64`, `bump`.

**Instructions**
1. `initialize_config(fee_bps)` — signer: deployer (payer). Sets admin, treasury, mint. Runs once.
2. `create_bounty(bounty_id, amount, deadline, pick_window_secs, brief_hash)` — signer: buyer. `amount ≥ 1_000_000` (1 tUSDC). `deadline` between now+60s and now+7d. `pick_window_secs` between 60s and 7d. Transfers `amount` from the buyer's ATA to the vault. Mint must equal `config.mint`.
3. `submit_entry(content_hash)` — signer: agent (pays the Entry rent). Requires `status == Open`, `now < deadline`, `entry_count < 10`. One Entry per agent per bounty (PDA seeds enforce it).
4. `pick_winner()` — signer: buyer (`has_one = buyer`). Requires `status == Open` and `deadline ≤ now < pick_deadline`. Takes the winner's Entry PDA (must belong to this bounty), the winner's ATA (`init_if_needed`, payer = buyer) and the treasury ATA. Pays `fee = amount * fee_bps / 10_000` (u128 math) to treasury and the rest to the winner. Sets `status = Awarded`, `winner = entry.agent`.
5. `auto_award()` — signer: `config.admin`. Requires `status == Open` and `now ≥ pick_deadline`. Same payout to the agent of the Entry passed in (chosen off-chain by the referee).
6. `refund()` — either signer `config.admin` with `status == Open` and `now ≥ deadline`, or signer buyer with `entry_count == 0` and `now ≥ deadline`. Full amount back to the buyer's ATA, no fee. Sets `status = Refunded`.

Custom error enum with explicit names. Emit events: `BountyCreated`, `EntrySubmitted`, `BountyAwarded`, `BountyRefunded`. Any unchecked account needs a `/// CHECK:` comment explaining why it is safe.

### Tasks
- [ ] **1.1 [auto] Implement the program per spec.**
  **Done when:** `anchor build` passes.
- [ ] **1.2 [auto] Happy-path tests:** init config; create bounty; 3 entries; `pick_winner` → winner +90%, treasury +10%, vault 0. `auto_award` path. Admin `refund` path. Buyer self-refund with 0 entries.
  For time: short real deadlines with waits, or a time-travel harness compatible with the installed Anchor (e.g. LiteSVM). Keep the whole suite under 3 minutes.
  **Done when:** `anchor test` is green.
- [ ] **1.3 [auto] Attack tests** (each must fail with the expected error): non-buyer `pick_winner` · pick before deadline · pick after `pick_deadline` · winner Entry from another bounty · winner with no Entry · double payout (pick twice / pick then `auto_award` / `auto_award` then `refund`) · submit after deadline · same agent submits twice · non-admin `auto_award` · non-admin `refund` · `auto_award` before `pick_deadline` · buyer self-refund when entries exist · wrong mint · wrong vault · amount below minimum · deadline in the past.
  **Done when:** `anchor test` is green with all of them.
- [ ] **1.4 [auto] Deploy to devnet.** `anchor keys sync`, build, `anchor deploy --provider.cluster devnet`. Write the program ID to `Anchor.toml`, `declare_id!` and `app/src/config/devnet.json`. If the deployer balance is too low → BLOCKERS.md ("André: faucet the deployer").
  **Done when:** `solana program show <PROGRAM_ID> --url devnet` succeeds.
- [ ] **1.5 [auto] `idl:sync` script.**
  **Done when:** the app imports the IDL types and `npm --prefix app run typecheck` passes.

---

## Bloc 2 — Devnet setup, chain client, database `[auto]`

- [ ] **2.1 [auto] `lib/solana/keys.ts`** (server-only): loads the platform and agent keypairs from files in `KEYS_DIR` locally, or from base58 env vars (`PLATFORM_SECRET_KEY`, `AGENT_MINIMAL_SECRET_KEY`, `AGENT_BOLD_SECRET_KEY`, `AGENT_LUXE_SECRET_KEY`) on Vercel. Never logs secrets. Also write `scripts/keys-export.ts` (prints base58 keys for André) — **write it, never run it.**
  **Done when:** typecheck passes and a small script prints the four **public** keys only.
- [ ] **2.2 [auto] `devnet:setup`** (idempotent, refuses if cluster ≠ devnet): create the tUSDC mint if missing (deployer = mint authority); `initialize_config` (admin = platform pubkey, treasury = platform pubkey); create the treasury ATA; mint 1,000 tUSDC to `DEMO_BUYER_ADDRESS` and 1,000 to the deployer; top up each agent and the platform to ≥ 0.1 SOL from the deployer. Write public addresses to `app/src/config/devnet.json`.
  **Done when:** a second run changes nothing and prints "already set up".
- [ ] **2.3 [auto] `lib/solana/client.ts`:** PDA helpers, typed fetchers (bounty, entries), builders for all 6 instructions, `explorerTx(sig)` → `https://explorer.solana.com/tx/<sig>?cluster=devnet`.
  **Done when:** typecheck passes and unit tests on PDA derivation pass.
- [ ] **2.4 [auto] `e2e:devnet`**, using the deployer as buyer, 60s deadline / 60s pick window:
  (A) create → 3 entries → wait → `pick_winner` · (B) create → 1 entry → wait → `auto_award` · (C) create → 0 entries → wait → buyer `refund`.
  Print balances before/after and Explorer links.
  **Done when:** it exits 0 and balances match (winner +90%, treasury +10%, refund 100%).
- [ ] **2.5 [auto] Supabase migration** (`supabase/migrations/`):
  - `bounties`: `id uuid pk default gen_random_uuid()`, `onchain_address text unique not null`, `bounty_id text`, `buyer text`, `amount bigint`, `deadline timestamptz`, `pick_deadline timestamptz`, `brief jsonb`, `brief_hash text`, `status text check (status in ('open','awarded','refunded'))`, `winner_agent text`, `create_tx text`, `settle_tx text`, `created_at timestamptz default now()`.
  - `entries`: `id uuid pk`, `bounty_id uuid references bounties on delete cascade`, `agent_key text check (agent_key in ('minimal','bold','luxe'))`, `agent_pubkey text`, `kit jsonb`, `logo_path text`, `content_hash text`, `submit_tx text`, `referee_pass boolean`, `referee_score int`, `referee_notes jsonb`, `created_at timestamptz default now()`, `unique (bounty_id, agent_key)`.
  - `agent_runs`: `bounty_id uuid`, `agent_key text`, `status text check (status in ('running','done','failed'))`, `error text`, `started_at`, `finished_at`, `primary key (bounty_id, agent_key)`.
  - RLS ON for all three. anon SELECT on `bounties` and `entries` only. No anon access to `agent_runs`. No anon writes anywhere.
  - Storage bucket `kits`: public read, writes with the service role only. Realtime on `bounties` and `entries`.
  - Apply with `supabase db push` (André exports `SUPABASE_DB_PASSWORD` in the shell before launching Claude Code).
  **Done when:** the push succeeds, and a script with the anon key can SELECT `bounties` but its INSERT is rejected.

---

## Bloc 3 — Agents, referee, server orchestration `[auto]`

- [ ] **3.1 [auto] Schemas** (`lib/agents/schema.ts`, zod) and **hashing** (`lib/hash.ts`):
  - `Brief`: `businessName` ≤60 · `whatItDoes` ≤300 · `audience` ≤200 · `vibe` 1–5 values from an allowed list · `avoid` ≤200 optional · `prizeTusdc` 1–1000 · `deadlinePreset` `'demo' | '1h' | '24h'` (demo = 2 min deadline + 2 min pick window).
  - `BrandKit`: `names` exactly 3 (≤40 each) · `tagline` ≤80 · `palette` exactly 5 × `{ name ≤24, hex /^#[0-9A-Fa-f]{6}$/ }` · `fonts { heading, body }` from a `FONT_ALLOWLIST` of ~20 Google Fonts · `logoSvg` ≤20 KB · `moodboard` exactly 4 visual scene descriptions ≤120 chars · `rationale` ≤120 words.
  - `hash.ts`: canonical JSON (sorted keys, no whitespace) → sha256 hex. Same function for `brief_hash` and `content_hash`.
  **Done when:** unit tests pass (same object with different key order → same hash).
- [ ] **3.2 [auto] `sanitize-svg.ts`** (DOMPurify + jsdom, SVG profile): strip `<script>`, `<foreignObject>`, `<image>`, `on*` attributes, `javascript:` and external `href`/`xlink:href`, CSS `@import` and `url()`. Enforce a `viewBox` and the size limit.
  **Done when:** unit tests with malicious samples (script, onload, javascript: href, external image, CSS import) all come out neutralized.
- [ ] **3.3 [auto] Agents** (`personas.ts`, `run-agent.ts`). Personas: **minimal** (Swiss, whitespace, 2-colour logo), **bold** (high contrast, street, playful), **luxe** (serif, deep tones, monogram). One Anthropic call per agent: system prompt = persona + output contract; the brief goes inside `<brief>…</brief>` and is labelled as untrusted data; JSON only → zod → one repair retry on failure → sanitize the SVG. 90s timeout.
- [ ] **3.4 [auto] Referee** (`referee.ts`): (a) deterministic checks (schema, allowlisted fonts, 5 distinct hex values, non-empty sanitized SVG, 3 names); (b) LLM judge on brief + kit inside untrusted-data tags → strict JSON `{ pass: boolean, score: 0-100, reasons: string[≤3] }` validated by zod. An entry passes only if (a) and (b).pass.
- [ ] **3.5 [auto] `agents:smoke`:** sample brief fixture → 3 agents in parallel → referee → table (agent, valid, pass, score, ms). Also run the referee on a deliberately off-brief fixture kit. Outputs go to `app/tmp/` (gitignored).
  **Done when:** exits 0, 3 valid kits, and the off-brief fixture fails the referee.
- [ ] **3.6 [auto] Route handlers** (Node runtime, `export const maxDuration = 300`):
  - `POST /api/bounties` `{ address, txSig, brief }` → fetch the Bounty on-chain; check Open, our mint, `brief_hash == hash(brief)`, deadline in the future → insert the row. Otherwise reject.
  - `POST /api/bounties/[id]/run/[agent]` → guards: bounty in DB, Open on-chain, `now < deadline − 15s`, insert `agent_runs` 'running' atomically (conflict = already ran → 409). Run the agent → upload the sanitized SVG to Storage → insert the entry → `submit_entry` signed by that agent's key → save `submit_tx` → 'done'. On error → 'failed', no retry loop.
  - `POST /api/bounties/[id]/referee` → after the deadline, score every unscored entry. Idempotent.
  - `POST /api/bounties/[id]/settle` → if Open on-chain: when `now ≥ pick_deadline`, `auto_award` the top passing entry; when no entry passes and `now ≥ deadline`, `refund`. Update the DB. Idempotent.
  - `POST /api/bounties/[id]/sync` → re-read on-chain state into the DB (used after the buyer's `pick_winner` from the browser).
  - All: zod inputs, per-IP rate limit (in-memory token bucket is fine for the demo), JSON errors without stack traces.
  **Done when:** `e2e:app` (against `next start` running locally) creates a bounty on-chain as the deployer-buyer, calls the routes, and ends with the bounty Awarded on-chain and 3 entries with referee scores in Supabase.

---

## Bloc 4 — Front end (Sat)

Direction: clean and confident, dark background, one accent colour, big countdown, works on a phone screen. A "DEVNET" badge is always visible.

- [ ] **4.1 [auto]** Layout, wallet adapter (Phantom), header with connected wallet and tUSDC balance.
- [ ] **4.2 [auto]** `/` — one-liner, "how it works" in 3 steps, list of recent bounties.
- [ ] **4.3 [auto]** `/new` — brief form (same zod schema) → build `create_bounty` → Phantom signs → confirm → `POST /api/bounties` → redirect to `/b/[id]` → fire the 3 `run` calls in parallel.
- [ ] **4.4 [auto]** `/b/[id]` — prize, status, countdown (deadline then pick deadline), Explorer links; 3 agent cards fed by Supabase Realtime ("working…" → brand board); referee badge (pass/score/reasons); "Pick this one" visible only to the buyer wallet between deadline and pick deadline → Phantom signs `pick_winner` → `/sync`; winner banner with payout transaction link. The page calls `/referee` at the deadline and `/settle` at the pick deadline.
- [ ] **4.5 [auto]** `BrandBoard` component: names, tagline, palette swatches with hex codes, fonts rendered via Google Fonts (allowlist only), logo via `<img src="data:image/svg+xml,...">`, moodboard as styled text tiles.
  **Done when (4.1–4.5):** `npm --prefix app run build` passes and `e2e:app` still passes.
- [ ] **4.6 [you] Vercel secrets.** Run `npm --prefix app run keys:export` **yourself**, paste the base58 keys and the other server variables into Vercel, redeploy, clear the terminal.
- [ ] **4.7 [you] Full browser test** with Phantom on devnet, locally and on Vercel (VPN on). Write bugs into BLOCKERS.md for Claude Code.

---

## Bloc 5 — Demo & submission (Sat evening → Mon 10:00)

- [ ] **5.1 [auto]** README.md: problem, how it works, architecture (Mermaid), program ID + Explorer link, security model, how to run locally.
- [ ] **5.2 [auto]** Demo seed: one command creates a "Paris bubble tea shop" bounty with demo timing. Plus a fallback: a finished, awarded bounty page to show if the live run fails.
- [ ] **5.3 [you]** Record a 2–3 min backup demo video.
- [ ] **5.4 [you]** Before going public: `gitleaks git -v` on the full history → 0 leaks. Then make the repo public.
- [ ] **5.5 [you]** Submit to Colosseum and to the Hacker House (Mon Oct 12, 10:00).
- [ ] **5.6 [you]** Rehearse the pitch 3 times with a timer.

---

## Overnight launch (Blocs 1–3)

```bash
cd ~/bounty-bot
caffeinate -dimsu &                                   # keep the Mac awake
read -s SUPABASE_DB_PASSWORD && export SUPABASE_DB_PASSWORD   # type it, nothing is shown or saved in history
claude --permission-mode auto
```

Then, inside Claude Code, paste:

```
/goal Follow CLAUDE.md and complete every [auto] task of Blocs 1, 2 and 3 in ROADMAP.md, in order. The goal is met when each of those tasks is ticked and its Done-when check was shown passing in this session — at minimum `anchor test` exits 0 including all attack tests, `npm --prefix app run e2e:devnet` exits 0 and prints Explorer links, `npm --prefix app run agents:smoke` exits 0, `npm --prefix app run e2e:app` exits 0 and `npm --prefix app run build` exits 0 — OR when every remaining unticked [auto] task in Blocs 1–3 is documented in BLOCKERS.md as needing André. Never weaken, skip or delete a test to make it pass. Never read secrets. Commit after each task, push after each Bloc. Stop after 150 turns.
```

**In the morning:** read `BLOCKERS.md`, then `PROGRESS.md`, then `git log --oneline`. Fix blockers with Claude Code before starting Bloc 4.
