# TaskMaster — Working Guide

> For architecture details see [ARCHITECTURE.md](./ARCHITECTURE.md). For env var reference see [ENV_MAINNET.md](./ENV_MAINNET.md).

TaskMaster is an autonomous AI agent on **Base mainnet** that decomposes complex jobs into tasks, hires human workers, verifies proof via AI vision, and pays out ETH.

Three-part repo:
- `agent/` — Express backend (TypeScript)
- `frontend/` — Vite + React
- `contracts/` — Foundry smart contracts

---

## Deployment Topology

| Component | Platform | URL / Address |
|-----------|----------|---------------|
| Agent backend | Railway | `https://relayer-backend-production.up.railway.app` |
| Frontend | Vercel | auto-deploys from git, or `vercel --prod` from `frontend/` |
| Smart contract | Base mainnet | `0x0B7ADc2864683104D75f614c092cF0eC13024633` |
| Agent wallet | CDP smart wallet | `0x4D8F9ee866c927959912c567aD0943fCd59924fB` |

### Railway Backend
- Dockerfile: `node:22-slim`, builds with `tsc`, runs `node dist/index.js`
- Health check: `GET /api/metrics`
- Config: `agent/railway.toml`

---

## x402 Payment Middleware — Critical Gotchas

**This is the #1 source of deployment bugs. Read carefully.**

1. **Testnet vs mainnet facilitator**: `https://facilitator.x402.org` is **testnet-only**. Mainnet MUST use the CDP facilitator at `https://api.cdp.coinbase.com/platform/v2/x402`.

2. **JWT auth required**: The CDP facilitator needs per-request JWTs via `createAuthHeaders`. Uses `generateJwt` from `@coinbase/cdp-sdk/auth`.

3. **`generateJwt` import path**: Only available via the subpath `@coinbase/cdp-sdk/auth` — it is NOT exported from the `@coinbase/cdp-sdk` root package.

4. **`FacilitatorConfig.createAuthHeaders`** returns `{ verify, settle, supported }` — each key maps to `Record<string, string>` headers.

5. **JWT params**: Each endpoint needs its own JWT with the correct `requestMethod` (GET for `supported`, POST for `verify`/`settle`) and full `requestPath` (e.g., `/platform/v2/x402/verify`).

6. **Transient fetch failures on Railway**: Containers sometimes fail the initial `/supported` fetch on cold start. The try-catch in `applyX402` and the `unhandledRejection` handler in `index.ts` prevent crashes. A redeploy usually resolves it.

---

## CDP Smart Wallet Setup

Mainnet uses `@coinbase/agentkit` with `CdpWalletProvider`.

`wallet.ts` must pass both:
- `address` — the smart wallet address
- `owner` — the EOA signer

to `configureWithWallet`.

Required env vars: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `CDP_SMART_WALLET_ADDRESS`, `CDP_OWNER_ACCOUNT_ADDRESS`.

---

## Known Issues / Limitations

- **Alchemy free tier**: `eth_getLogs` limited to 10-block range — state recovery (`recovery.ts`) fails on startup. Needs Alchemy PAYG or an alternative RPC to fix.
- **Agent ETH balance**: Wallet `0x4D8F9ee866c927959912c567aD0943fCd59924fB` needs ETH for gas. Check balance in Railway logs on startup.
- **MCP module types**: `src/mcp/` has pre-existing TS errors (missing `@modelcontextprotocol/sdk` types). Build still succeeds because these don't block `tsc` output for other modules.
- **`bigint` binding warning**: `bigint: Failed to load bindings, pure JS will be used` — cosmetic, no impact.

---

## Deployment Procedures

```bash
# Redeploy backend
cd agent && railway up --detach

# Check logs
railway logs    # from agent/ dir

# Verify health
curl https://relayer-backend-production.up.railway.app/api/metrics

# Redeploy frontend
cd frontend && vercel --prod

# Set Railway env vars
railway variables --set KEY=VALUE
```

---

## Key File Reference

| File | Purpose |
|------|---------|
| `agent/src/x402/x402-middleware.ts` | x402 payment middleware (CDP facilitator + JWT) |
| `agent/src/wallet.ts` | Wallet initialization (Anvil vs CDP) |
| `agent/src/config.ts` | Network config (localhost / sepolia / base) |
| `agent/src/index.ts` | Entry point, server setup, error handlers |
| `agent/Dockerfile` | Railway build config |
| `agent/railway.toml` | Railway deploy settings |
