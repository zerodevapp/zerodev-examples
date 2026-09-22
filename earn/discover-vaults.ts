// Discovery: what chains and tokens are supported, and which vaults you can deposit into.

import "dotenv/config";
import { TOKENS } from "@zerodev/earn";
import { arbitrum, base } from "viem/chains";
import { earn, run } from "./utils";

async function main() {
  const chains = await earn.getChains();
  console.log("Supported chains:", chains.map((c) => c.id).join(", "));

  const tokens = await earn.getTokens({ chainId: base.id });
  console.log("Funding tokens on Base:", tokens.map((t) => t.tokenType).join(", "));

  // Filters run server-side, so filter here instead of fetching everything. minTvl defaults to
  // $100k, so pass `minTvl: 0` to see smaller vaults.
  const { vaults, nextPage } = await earn.listVaults({
    asset: TOKENS.USDC,
    chains: [base.id, arbitrum.id],
    minApy: 3,
  });
  console.log(`\n${vaults.length} USDC vaults, nextPage: ${nextPage}`);
  for (const vault of vaults.slice(0, 10)) {
    console.log(
      [
        vault.protocol.padEnd(10),
        `chain ${vault.chainId}`,
        vault.apy != null ? `${vault.apy.toFixed(2)}%` : "apy n/a",
        vault.id,
      ].join("  ")
    );
  }

  const [vault] = vaults;
  if (!vault) return;

  // `maturity` exists only on fixed-yield vaults, so narrow on `category` before reading it.
  if (vault.category === "fixed-yield") console.log("matures at", vault.maturity);

  // Passing chainId hits the single-vault endpoint instead of scanning the list.
  const details = await earn.getVault(vault.id, vault.chainId);
  console.log("\nDetails for", details.name ?? details.id);
  console.log("  apy 7d / 30d:", details.apy7day, "/", details.apy30day);
  console.log("  tvl usd:", details.tvlUsd);
  console.log("  asset:", details.asset.symbol, details.asset.address);

  // A `Vault` carries chainId, asset and protocol, so it goes straight into a deposit as `into`.
}

run(main);
