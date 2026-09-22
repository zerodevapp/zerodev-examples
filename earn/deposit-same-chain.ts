// Same-chain deposit: fund on Base, deposit into a Morpho vault on Base, signed by an EOA.

import "dotenv/config";
import { TOKENS } from "@zerodev/earn";
import { base } from "viem/chains";
import {
  earn,
  pickDepositableVault,
  printQuote,
  run,
  sendCallsWithEoa,
  signer,
} from "./utils";

// Display units. The server scales by the token's decimals.
const AMOUNT = "1";

async function main() {
  // The owner funds, signs, receives the vault shares, and gets any refund.
  const owner = signer.address;

  const { vaults } = await earn.listVaults({
    asset: TOKENS.USDC,
    chains: [base.id],
    protocol: "morpho",
  });
  if (vaults.length === 0) throw new Error("no Morpho USDC vault on Base");

  const { vault, preflight } = await pickDepositableVault(vaults, owner, AMOUNT);
  console.log("Vault:", vault.name ?? vault.id, `(${vault.protocol}, chain ${vault.chainId})`);
  console.log("Max deposit:", preflight.maxDeposit ?? "no cap");

  // Same-chain because srcChainId equals the vault's chain. Still an SRA deposit, just no bridge
  // leg. `destChainId` comes from the vault object.
  const quote = await earn.morpho.deposit({
    owner,
    amount: AMOUNT,
    token: TOKENS.USDC,
    srcChainId: vault.chainId,
    into: vault,
  });
  printQuote(quote, vault.asset.decimals);
  if (!quote.sra) throw new Error("deposit quote came back without an SRA");

  // The SDK never signs. `transaction.calls` is the owner-signed src-chain batch, sent in order.
  console.log("\nFunding the SRA...");
  await sendCallsWithEoa(quote.transaction.calls, quote.transaction.chainId);

  // That funding transaction is the user's only signature. Poll until the relayer is done.
  const watcher = earn.watchStatus(quote.sra, {
    onStatusChange: (status) =>
      console.log("status:", status.state, status.failureReason ?? ""),
  });
  await watcher.done;
}

run(main);
