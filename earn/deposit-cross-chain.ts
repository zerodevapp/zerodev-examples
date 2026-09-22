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

  // `depositIntoVault` works with any protocol, so `protocol` is passed explicitly. Prefer a facade
  // (earn.morpho.deposit, earn.aave.deposit, ...) when one exists.
  const quote = await earn.depositIntoVault({
    owner,
    amount: AMOUNT,
    token: TOKENS.USDC,
    srcChainId: base.id,
    into: vault,
    protocol: vault.protocol,
    // Slippage in bps, default 100 (1%). See deposit-aave.ts for the SLIPPAGE_TOO_LOW retry.
    slippage: 100,
  });
  printQuote(quote, vault.asset.decimals);
  if (!quote.sra) throw new Error("deposit quote came back without an SRA");

  // There is no destination transaction to send: those calls are stored in the SRA and run by the
  // relayer when the funds arrive.
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

  // If the destination deposit reverts, the bridged tokens rest in the SRA and the owner pulls them
  // back. See recover-from-sra.ts.
}

run(main);
