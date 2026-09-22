// Aave V3 supply. Aave has one pool per chain, so there is no vault to pick: the reserve follows
// from the token plus the destination chain. Also shows how to react to a typed error.

import "dotenv/config";
import { EarnError, TOKENS, type Quote } from "@zerodev/earn";
import { base } from "viem/chains";
import { earn, printQuote, run, sendCallsWithEoa, signer } from "./utils";

const AMOUNT = "1";
const USDC_DECIMALS = 6;

async function quoteAaveDeposit(slippage: number): Promise<Quote> {
  return earn.aave.deposit({
    owner: signer.address,
    amount: AMOUNT,
    token: TOKENS.USDC,
    srcChainId: base.id,
    // Set this to another chain to bridge into that chain's Aave pool instead.
    destChainId: base.id,
    slippage,
  });
}

async function main() {
  let quote: Quote;
  try {
    quote = await quoteAaveDeposit(50); // 0.5%
  } catch (e) {
    // Route fees can exceed the slippage budget. The error names the value that would work.
    // SLIPPAGE_TOO_LOW has no bound subclass, so branch on the code, not on instanceof.
    if (!(e instanceof EarnError) || e.code !== "SLIPPAGE_TOO_LOW") throw e;
    const { minSlippageBps } = e.details as { minSlippageBps: number };
    console.log("slippage too low, retrying with", minSlippageBps, "bps");
    quote = await quoteAaveDeposit(minSlippageBps);
  }

  printQuote(quote, USDC_DECIMALS);
  if (!quote.sra) throw new Error("deposit quote came back without an SRA");

  console.log("\nFunding the SRA...");
  await sendCallsWithEoa(quote.transaction.calls, quote.transaction.chainId);

  // The aTokens land on `owner`, not on the SRA — the position is the user's from the start.
  const watcher = earn.watchStatus(quote.sra, {
    onStatusChange: (status) =>
      console.log("status:", status.state, status.failureReason ?? ""),
  });
  await watcher.done;
}

run(main);
