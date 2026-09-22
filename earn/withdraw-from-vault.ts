// Exit a vault position. Withdraw is the mirror image of deposit and much smaller: same-chain,
// owner-signed, no SRA, no bridge, no quote to expire.
//
//   npx ts-node earn/withdraw-from-vault.ts <vaultId> [chainId]

import "dotenv/config";
import { formatUnits } from "viem";
import { base } from "viem/chains";
import { earn, run, sendCallsWithEoa, signer } from "./utils";

async function main() {
  const vaultId = process.argv[2];
  const chainId = Number(process.argv[3] ?? base.id);
  if (!vaultId) throw new Error("pass a vaultId (see discover-vaults.ts)");

  const owner = signer.address;

  // Neither `amount` nor `max` is a preview: same on-chain reads and gates, no calls built. This is
  // how a UI shows the position size before the user picks an amount.
  const preview = await earn.withdrawFromVault({ owner, vaultId, chainId });
  console.log(
    "available now:",
    formatUnits(BigInt(preview.available), preview.decimals),
    preview.assetSymbol
  );
  // `available` is what can leave right now, not the position size — it already subtracts what the
  // protocol would refuse (vault caps, Aave health factor, thin reserve liquidity).
  if (preview.available === "0") return console.log("nothing to withdraw");

  // `max: true` uses the protocol's own exit-everything form, so interest accruing between this call
  // and the signature cannot leave a residue behind. For a partial exit pass display units instead:
  //   { owner, vaultId, chainId, amount: "0.5" }
  const exit = await earn.withdrawFromVault({ owner, vaultId, chainId, max: true });
  console.log(
    "withdrawing:",
    formatUnits(BigInt(exit.amount), exit.decimals),
    exit.assetSymbol,
    "exitAll:",
    exit.exitAll // false = a protocol cap held the exit below the position
  );

  await sendCallsWithEoa(exit.calls, exit.chainId);
  console.log("assets sent to", exit.receiver);
}

run(main);
