// Deposit from a Kernel smart account: the whole funding batch goes out as one user op, gas
// sponsored by the project's paymaster.

import "dotenv/config";
import { TOKENS } from "@zerodev/earn";
import { arbitrum, base } from "viem/chains";
import { earn, getKernelClient, pickDepositableVault, printQuote, run } from "./utils";

const AMOUNT = "1";

async function main() {
  const kernelClient = await getKernelClient(base.id);
  // Quote for the smart account address, not for the signer behind it.
  const owner = kernelClient.account.address;
  console.log("Kernel account:", owner);

  const { vaults } = await earn.listVaults({
    asset: TOKENS.USDC,
    chains: [arbitrum.id],
    minApy: 3,
  });
  if (vaults.length === 0) throw new Error("no USDC vault on Arbitrum matched the filters");
  const { vault } = await pickDepositableVault(vaults, owner, AMOUNT);

  const quote = await earn.depositIntoVault({
    owner,
    amount: AMOUNT,
    token: TOKENS.USDC,
    srcChainId: base.id,
    into: vault,
    protocol: vault.protocol,
  });
  printQuote(quote, vault.asset.decimals);
  if (!quote.sra) throw new Error("deposit quote came back without an SRA");

  // `userOp.callData` is the same batch as `transaction.calls`, pre-encoded as a Kernel v3
  // `executeBatch`. A non-Kernel smart account re-encodes `quote.userOp.calls` itself.
  const userOpHash = await kernelClient.sendUserOperation({
    callData: quote.userOp.callData,
  });
  console.log("\nUser op:", userOpHash);
  const receipt = await kernelClient.waitForUserOperationReceipt({ hash: userOpHash });
  console.log("Mined in", receipt.receipt.transactionHash);

  // Polling `getStatus` by hand, instead of the `watchStatus` used in the other examples.
  for (;;) {
    const status = await earn.getStatus(quote.sra);
    const executed = status.deposits.find((d) => d.execution);
    console.log("state:", status.state, status.failureReason ?? "");
    if (executed) console.log("  shares minted in", executed.execution?.transactionHash);
    if (status.state === "COMPLETED" || status.state === "FAILED" || status.state === "ABANDONED")
      break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

run(main);
