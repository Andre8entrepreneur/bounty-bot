# BLOCKERS — things only André can resolve

## 0.3 — Devnet SOL faucet exhausted

- **What:** Deployer wallet (`5WGHEDyctGEaWPETPpGk89q45GRfz8BGNVcuRTmqDuZw`) needs ~5 SOL devnet to pay for program deployment and test transactions. The Phantom buyer wallet / `DEMO_BUYER_ADDRESS` (`AsmskYw3N37XVwmeHnHwebyEHx5M4S555pXBJAHwj7Wh`) also needs ~1 SOL devnet.
- **Tried:** `solana airdrop` CLI (rate limited), faucet.solana.com web (requires GitHub verification, account failed both "too few" and "too many public repos" checks), QuickNode faucet (requires a mainnet SOL balance, not applicable here), Helius faucet.
- **Error:** `429 — You've either reached your airdrop limit today or the airdrop faucet has run dry.`
- **What André must do:** Retry a devnet faucet later (limits often reset after several hours), or ask someone else with existing devnet SOL to send a transfer to the deployer address above. Once funded, resume Bloc 0 task 0.3 (faucet the Phantom buyer wallet too), Bloc 1 task 1.4 (`anchor deploy --provider.cluster devnet`), and Bloc 2 tasks 2.2 (`devnet:setup`) and 2.4 (`e2e:devnet`), all of which depend on this.
- **Not blocking:** Tasks 0.4, 0.5, 0.6, 0.7, 1.1, 1.2, 1.3, 1.5, 2.1, 2.3, 2.5 do not require SOL and are done — only 1.4, 2.2, 2.4 are skipped pending funding.

## 3.5 — Anthropic API key rejected (401 invalid x-api-key)

- **What:** `npm --prefix app run agents:smoke` fails on all 3 agents and the referee call with `401 {"type":"authentication_error","message":"invalid x-api-key"}`. `ANTHROPIC_API_KEY` in `app/.env.local` is being sent (check:env reports it "set") but the Anthropic API rejects it.
- **Tried:** Ran the smoke test 4 times total (3 agents in parallel + the off-brief referee check) — same 401 every time, so this isn't transient/rate-limiting, the key itself isn't authenticating. Cannot diagnose further — `.env.local` is never read by Claude, so there's no way to check for a copy-paste issue (stray whitespace/quotes, truncated key) or whether the key was revoked/regenerated since it was filled in at task 0.4.
- **What André must do:** In your own editor, open `app/.env.local` and confirm `ANTHROPIC_API_KEY` is the exact key from console.anthropic.com -> API Keys (no extra quotes/whitespace, not truncated). If it looks right, the key may have been revoked or the org/workspace changed — generate a fresh key there and replace it. Then just say so; I'll rerun `npm --prefix app run agents:smoke` myself.
- **Not blocking:** Tasks 3.1-3.4 are written and typecheck/build clean but have no independent Done-when — they're only verified by 3.5's smoke test actually passing, so their ROADMAP boxes stay unticked until this is fixed and the smoke test is rerun. Task 3.6 (route handlers) doesn't need a working key to write/typecheck/build and proceeds next; its own Done-when (`e2e:app`) already depends on the devnet-funding blocker above, independent of this one.
