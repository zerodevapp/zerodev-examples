// Recover funds that reached the SRA but never made it into the vault. If the destination deposit
// reverts, the tokens rest in the SRA and the owner can pull them back at any time.
//
//   npx ts-node earn/recover-from-sra.ts <sra>

import "dotenv/config";
import type { Address } from "viem";
import { earn, run, sendCallsWithEoa } from "./utils";

async function main() {
  const sra = process.argv[2] as Address;
  if (!sra) throw new Error("pass the SRA address from the quote");

  const info = await earn.getSraInfo({ sra });
  console.log("owner:", info.owner);
  console.log("execution chain:", info.executionChainId, "slippage:", info.slippage, "bps");

  const status = await earn.getStatus(sra);
  console.log("state:", status.state, status.failureReason ?? "");

  // Only deposits that landed without executing are recoverable. The rest are already in the vault.
  const tokens: { chainId: number; token: Address }[] = [];
  const seen = new Set<string>();
  for (const deposit of status.deposits) {
    if (deposit.execution) continue;
    const key = `${deposit.deposit.chainId}:${deposit.deposit.token.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push({ chainId: deposit.deposit.chainId, token: deposit.deposit.token });
  }
  if (tokens.length === 0) return console.log("nothing stranded in this SRA");

  const { data, receiver } = await earn.getWithdrawCalls({ sra, tokens });
  console.log("recovering", tokens.length, "token(s) to", receiver);

  // Grouped per chain: funds can be stranded on the source chain, the destination chain, or both.
  for (const group of data) {
    console.log("chain", group.chainId);
    await sendCallsWithEoa(
      group.calls.map((call) => ({
        to: call.to,
        data: call.data ?? "0x",
        value: call.value,
      })),
      group.chainId
    );
  }
}

run(main);
