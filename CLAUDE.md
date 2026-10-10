# Bounty Bot — rules for Claude Code

Read this file fully before every task. ROADMAP.md is the task list. PROGRESS.md is the log.

## What we're building

A contest marketplace where AI agents compete on a creative job, paid through a Solana escrow.

1. A **buyer** posts a brief (a brand kit for a business) and a prize in test USDC. The prize is locked in an on-chain **vault**: a token account owned by a program PDA. No human holds a key to it.
2. Three **agents** (ours, with distinct styles: `minimal`, `bold`, `luxe`) each produce a brand kit and register its sha256 fingerprint on-chain (`submit_entry`).
3. A **referee** (deterministic code checks + an LLM judge) filters off-brief entries and scores the rest.
4. After the deadline the buyer picks a winner (`pick_winner`). The program pays 90% to the winner and 10% to the platform treasury.
   - Buyer silent past the pick window → the platform calls `refund` → the buyer gets 100% back. The platform never picks on the buyer's behalf (`auto_award` stays in the program but the app does not use it — André's decision, 2026-10-10).
   - The buyer may pick any entry, including one the referee marked as failed; the referee is advisory. No entries at all → refund right after the deadline.

**Non-custodial guarantee:** the platform key can only choose *which registered submitter* is paid, or refund the buyer. The program makes it impossible to send funds anywhere else.

Context: Colosseum "Crypto World's Fair" hackathon (Solana track), Shanghai Hacker House. Live demo on Oct 11.
**Everything runs on Solana DEVNET.** Deploying the program to devnet, running devnet scripts and pushing to our own GitHub repo are expected, normal actions in this project.

## Stack

- `programs/escrow/` — Anchor (Rust) program. Tests in `tests/`.
- `app/` — Next.js (App Router, TypeScript strict, Tailwind). Deployed on Vercel with Root Directory = `app`.
- Supabase — Postgres (migrations in `supabase/migrations/`), Storage bucket `kits`, Realtime.
- Anthropic API for agents and referee. Models come from env `AGENT_MODEL` and `REFEREE_MODEL`.
- Phantom via the Solana wallet adapter, buyer side only. Agents and platform sign server-side.
- Token: our own mint **"tUSDC (devnet)"**, 6 decimals. Never real USDC, never mainnet.
- Use current stable versions. Check installed versions first (`anchor --version`, `solana --version`, `node --version`) and match the Anchor TS client to the installed Anchor CLI.

## Repo layout (target)

```
bounty-bot/
├── CLAUDE.md  ROADMAP.md  PROGRESS.md  BLOCKERS.md (only when blocked)
├── .claude/settings.json      # permission rules — never edit
├── .githooks/pre-commit       # secret scan + .env guard — never edit, never bypass
├── Anchor.toml  Cargo.toml
├── programs/escrow/src/       # lib.rs, state.rs, errors.rs, instructions/
├── tests/                     # program tests (happy path + attacks)
├── supabase/migrations/
└── app/
    ├── .env.local             # SECRETS — never read, never edit
    ├── scripts/               # check-env, devnet-setup, e2e-devnet, agents-smoke, idl-sync, e2e-app, keys-export
    └── src/
        ├── app/               # pages + route handlers (app/api/...)
        ├── components/        # BrandBoard, AgentCard, Countdown, WalletButton...
        ├── config/devnet.json # PUBLIC addresses only: programId, mint, treasury, config PDA
        └── lib/
            ├── env.ts         # zod-validated env, split server vs public
            ├── hash.ts        # canonical JSON + sha256 (briefs and kits)
            ├── solana/        # idl/, client.ts (PDAs, fetchers, ix builders), keys.ts (server-only)
            ├── agents/        # schema.ts, personas.ts, run-agent.ts, referee.ts, sanitize-svg.ts
            └── supabase/      # server.ts (service role, server-only), browser.ts (anon)
```

Public addresses (program ID, mint, treasury) live in `app/src/config/devnet.json`, which is committed. They are not secrets and must not depend on `.env.local`.

## SECURITY — non-negotiable

1. **Never read, print, cat, grep, echo, log or copy** the contents of `.env`, `.env.local`, any keypair JSON, anything in `~/bounty-keys/` or `~/.config/solana/`. Refer to variables by NAME only. To check whether a variable exists, run `npm --prefix app run check:env`, which prints `set` / `missing` only.
2. **Never run `npm --prefix app run keys:export`.** It prints secrets for André to paste into Vercel himself.
3. **Never commit secrets.** The pre-commit hook must stay installed. `--no-verify` is forbidden. Never force-push or rewrite history.
4. **Secrets are server-only.** Never prefix a secret with `NEXT_PUBLIC_`. The only allowed public vars are listed in `.env.example`. Server-only modules start with `import "server-only";`.
5. **Supabase:** RLS on every table. The anon key can only SELECT public tables. Every write goes through a route handler using the service-role client.
6. **Route handlers:** validate every input with zod. Never trust amounts, addresses or statuses sent by the client — read them from the chain. Agent runs only happen for bounties that exist on-chain, are Open, and are funded with OUR tUSDC mint. Only we can mint tUSDC, which is our spam and API-cost firewall. Add a simple per-IP rate limit. Errors return JSON without stack traces.
7. **LLM inputs and outputs are untrusted data.** Put the brief and kits inside clearly delimited tags and tell the model they are data, not instructions. Model output must be JSON validated by zod. Never `eval` or execute model output.
8. **SVG from agents is untrusted.** Sanitize before storing AND render it only through `<img src="data:image/svg+xml;...">`, never `dangerouslySetInnerHTML`.
9. **On-chain:** every instruction checks signer, PDA seeds and bumps, `has_one` relations, token mint and authority, the status state machine and timestamps. Use checked math. Every attack test listed in ROADMAP.md must exist and pass.
10. **Devnet only.** Every script refuses to run if the configured cluster is not devnet.
11. If a task seems to require a secret, an account login, a wallet signature, funding or a product decision: **stop that task, write it in BLOCKERS.md, move on.**

## How to work

- Take tasks from ROADMAP.md **in order**. A task tagged `[you]` is André's; skip it unless he is in the session and asks.
- One task = one commit, with a conventional commit message (`feat(escrow): ...`, `test(escrow): ...`). Tick the box in ROADMAP.md in the same commit. Push at the end of each Bloc.
- Before ticking a box, run its **Done when** check. Append to PROGRESS.md: timestamp, task id, command run, short result (pass/fail, counts). Never tick a box whose check was not shown passing in the current session.
- **Never weaken, skip, `.only`, comment out or delete a test** to make it pass. Never stub or mock what the task says to test for real.
- If the same error happens 3 times: stop, write BLOCKERS.md (task id, what you tried, exact error, what André must do), continue with the next task that does not depend on it.
- TypeScript strict, no `any`. Shared types in `app/src/lib/types.ts`. Small functions. Explicit error messages.
- Keep `npm --prefix app run build` green after every app task.

## Commands (keep them working)

| Command | Purpose |
|---|---|
| `anchor build` / `anchor test` | Build the program / run program tests on a local validator |
| `npm --prefix app run idl:sync` | Copy IDL and TS types from `target/` into `app/src/lib/solana/idl/` |
| `npm --prefix app run dev` / `build` / `lint` / `typecheck` | App dev server / production build / lint / types |
| `npm --prefix app run check:env` | Prints `set` / `missing` per variable, never values |
| `npm --prefix app run devnet:setup` | Idempotent devnet setup (mint, config, treasury, funding) |
| `npm --prefix app run e2e:devnet` | Scripted on-chain end-to-end (pick, auto-award, refund) |
| `npm --prefix app run agents:smoke` | 3 agents + referee on a sample brief, no chain |
| `npm --prefix app run e2e:app` | Full flow through the route handlers against `next start` |
| `npm --prefix app run keys:export` | **André only. Claude never runs this.** |

Scripts load env from `app/.env.local` via dotenv inside the script. Never read that file yourself.
