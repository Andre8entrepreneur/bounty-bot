# BLOCKERS — things only André can resolve

## 0.3 — Devnet SOL faucet exhausted

- **What:** Deployer wallet (`5WGHEDyctGEaWPETPpGk89q45GRfz8BGNVcuRTmqDuZw`) needs ~5 SOL devnet to pay for program deployment and test transactions. The Phantom buyer wallet / `DEMO_BUYER_ADDRESS` (`AsmskYw3N37XVwmeHnHwebyEHx5M4S555pXBJAHwj7Wh`) also needs ~1 SOL devnet.
- **Tried:** `solana airdrop` CLI (rate limited), faucet.solana.com web (requires GitHub verification, account failed both "too few" and "too many public repos" checks), QuickNode faucet (requires a mainnet SOL balance, not applicable here), Helius faucet.
- **Error:** `429 — You've either reached your airdrop limit today or the airdrop faucet has run dry.`
- **What André must do:** Retry a devnet faucet later (limits often reset after several hours), or ask someone else with existing devnet SOL to send a transfer to the deployer address above. Once funded, resume Bloc 0 task 0.3 (faucet the Phantom buyer wallet too) and Bloc 1 task 1.4 (`anchor deploy --provider.cluster devnet`) which depends on this.
- **Not blocking:** Tasks 0.4, 0.5, 0.6, 0.7, 1.1, 1.2, 1.3, 1.5 do not require SOL and are done — only 1.4 (deploy) is skipped pending funding.
