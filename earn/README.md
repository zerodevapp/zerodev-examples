# ZeroDev Earn

[`@zerodev/earn`](https://docs.zerodev.app/onramp/earn) turns a DeFi intent ("deposit this USDC into
a vault on another chain") into a quote: a Smart Routing Address (SRA) to fund, plus the
ready-to-sign source-chain calls. The user signs once, on one chain. A relayer bridges and runs the
deposit on the destination chain.

The SDK is a thin HTTP client. It holds no keys, makes no RPC calls, and never broadcasts. You send
the calls it hands back, with whatever wallet you already have: an EOA, a Kernel account, or any
other smart account.

The package is in beta, so `package.json` pins `1.0.0-beta.0`. Installing it by name needs the beta
tag: `npm i @zerodev/earn@beta`.

## Flows

| Script | Flow |
| --- | --- |
| `discover-vaults.ts` | Supported chains and tokens, vault search, vault details |
| `deposit-same-chain.ts` | Fund on Base, deposit into a Morpho vault on Base (EOA), with preflight |
| `deposit-cross-chain.ts` | Fund USDC on Base, land in an Arbitrum vault, track status to completion |
| `deposit-aave.ts` | Aave V3 supply (no vault to pick) and reacting to a typed error |
| `deposit-with-kernel.ts` | Same deposit as one sponsored user op from a Kernel account |
| `withdraw-from-vault.ts` | Preview a position, then exit it |
| `recover-from-sra.ts` | Pull back funds that reached the SRA but never entered the vault |

## Setup

These examples run on **mainnet** (Base and Arbitrum) with real funds, unlike the rest of this repo.
Keep the amounts small. Every script deposits `1` USDC by default.

Add the variables from [`.env.example`](./.env.example) to the repo's `.env`:

```bash
ZERODEV_PROJECT_ID=   # from https://dashboard.zerodev.app
PRIVATE_KEY=          # holds the USDC being deposited
ZERODEV_RPC=          # only for deposit-with-kernel.ts; must be a Base project RPC
```

The signer needs USDC on Base (plus a little ETH for gas, except in the Kernel example where the
project's paymaster sponsors it).

## Run

```bash
npx ts-node earn/discover-vaults.ts
npx ts-node earn/deposit-same-chain.ts
npx ts-node earn/deposit-cross-chain.ts
npx ts-node earn/deposit-aave.ts
npx ts-node earn/deposit-with-kernel.ts

# these two take arguments
npx ts-node earn/withdraw-from-vault.ts <vaultId> [chainId]
npx ts-node earn/recover-from-sra.ts <sra>
```

## Things worth knowing

- **One `owner`.** The same address funds, signs, receives the shares and gets any refund. With a
  smart account that address is the account, not the signer behind it.
- **Amounts.** Deposit and withdraw params take display units (`"1"` = 1 USDC) and are scaled
  server-side. Everything coming back (fees, shares, `available`) is a base-unit string, so parse
  with `BigInt` and format with `formatUnits`.
- **Quotes expire** (about 60s). Quote when the user is ready to sign, not before.
- **Errors are typed.** `EarnError` carries a stable `code` and `details`. Branch on the code.
  `SLIPPAGE_TOO_LOW` even tells you what to retry with (see `deposit-aave.ts`).
- **Nothing is stuck for long.** A destination revert leaves the tokens in the SRA, recoverable by
  the owner at any time (`recover-from-sra.ts`).
