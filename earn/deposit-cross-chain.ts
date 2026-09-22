// Cross-chain deposit: fund USDC on Base, land in a vault on Arbitrum, one signature.
// Uses the generic engine method, so the vault's protocol is passed explicitly.

import "dotenv/config";
import { TOKENS } from "@zerodev/earn";
import { arbitrum, base } from "viem/chains";
import {
  earn,
  pickDepositableVault,
  printQuote,
  run,
  sendCallsWithEoa,
  signer,
} from "./utils";

const AMOUNT = "1";

async function main() {
  const owner = signer.address;

  const { vaults } = await earn.listVaults({
    asset: TOKENS.USDC,
    chains: [arbitrum.id],
    minApy: 3,
  });
  if (vaults.length === 0) throw new Error("no USDC vault on Arbitrum matched the filters");

  const { vault } = await pickDepositableVault(vaults, owner, AMOUNT);
  console.log("Vault:", vault.name ?? vault.id, `(${vault.protocol}, chain ${vault.chainId})`);

  // `depositIntoVault` is the escape hatch for any protocol: no facade binds `protocol`, so pass it.
  // Prefer a facade (earn.morpho.deposit, earn.aave.deposit, ...) when one exists.
  const quote = await earn.depositIntoVault({
    owner,
    amount: AMOUNT,
    token: TOKENS.USDC,
    srcChainId: base.id,
    into: vault,
    protocol: vault.protocol,
    // Slippage in bps, default 100 (1%). Cross-chain quotes are rejected when it cannot cover the
    // route fees — the SLIPPAGE_TOO_LOW error then carries `details.minSlippageBps` to retry with.
    slippage: 100,
  });
  printQuote(quote, vault.asset.decimals);
  if (!quote.sra) throw new Error("deposit quote came back without an SRA");

  // Every call in a quote is owner-signed on the source chain. There is no destination transaction
  // to send: the destination calls are baked into the SRA and run by the relayer on arrival.
  console.log("\nFunding the SRA on Base...");
  await sendCallsWithEoa(quote.transaction.calls, quote.transaction.chainId);

  // PENDING -> BRIDGING -> EXECUTING -> COMPLETED. `done` rejects if polling keeps failing or the
  // deposit never reaches a terminal state (10 min default).
  const watcher = earn.watchStatus(quote.sra, {
    interval: 5000,
    onStatusChange: (status) => {
      console.log("status:", status.state, status.failureReason ?? "");
      const executed = status.deposits.find((d) => d.execution);
      if (executed) console.log("  executed in", executed.execution?.transactionHash);
    },
  });
  await watcher.done;

  // If the destination deposit ever reverts, the bridged tokens rest in the SRA and the owner pulls
  // them back — see recover-from-sra.ts.
}

run(main);
