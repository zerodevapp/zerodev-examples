// Shared setup for the ZeroDev Earn examples.

import "dotenv/config";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { KERNEL_V3_3, getEntryPoint } from "@zerodev/sdk/constants";
import {
  EarnError,
  createEarnClient,
  type OnChainCall,
  type Quote,
  type Vault,
} from "@zerodev/earn";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, base } from "viem/chains";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// These examples run on mainnet with real funds. Keep the amounts small.
const CHAINS: Chain[] = [base, arbitrum];

export function chainFor(chainId: number): Chain {
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain) throw new Error(`add chain ${chainId} to CHAINS in earn/utils.ts`);
  return chain;
}

export const signer = privateKeyToAccount(requireEnv("PRIVATE_KEY") as Hex);

// The SDK is a thin HTTP client: no signer, no RPC, nothing on-chain.
export const earn = createEarnClient({
  projectId: requireEnv("ZERODEV_PROJECT_ID"),
});

const publicClientFor = (chainId: number) =>
  createPublicClient({ chain: chainFor(chainId), transport: http() });

// First vault in a listing that takes deposits right now. A listing can look healthy while the
// vault's on-chain deposit cap is 0, and only preflight's on-chain read sees that.
export async function pickDepositableVault(
  vaults: Vault[],
  owner: Address,
  amount: string
) {
  for (const vault of vaults.slice(0, 5)) {
    const preflight = await earn.preflight({
      owner,
      destChainId: vault.chainId,
      vaultId: vault.address,
      // preflight takes base units, unlike the display units a deposit takes
      amount: parseUnits(amount, vault.asset.decimals).toString(),
    });
    if (!preflight.depositsDisabled) return { vault, preflight };
    console.log("skipping", vault.id, "- deposits disabled");
  }
  throw new Error("no vault in this listing is accepting deposits");
}

// Send the quote's calls from a plain EOA, in order, waiting for each receipt.
export async function sendCallsWithEoa(
  calls: OnChainCall[],
  chainId: number
): Promise<Hex[]> {
  const walletClient = createWalletClient({
    account: signer,
    chain: chainFor(chainId),
    transport: http(),
  });
  const publicClient = publicClientFor(chainId);
  const hashes: Hex[] = [];
  for (const call of calls) {
    const hash = await walletClient.sendTransaction({
      to: call.to,
      data: call.data,
      value: BigInt(call.value),
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log("  sent", hash);
    hashes.push(hash);
  }
  return hashes;
}

// ZERODEV_RPC is the bundler + paymaster endpoint, so it must belong to a project on `chainId`.
export async function getKernelClient(chainId: number) {
  const chain = chainFor(chainId);
  const zerodevRpc = requireEnv("ZERODEV_RPC");
  const publicClient = createPublicClient({ chain, transport: http(zerodevRpc) });
  const entryPoint = getEntryPoint("0.7");
  const kernelVersion = KERNEL_V3_3;

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  });
  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion,
  });
  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(zerodevRpc),
  });

  return createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(zerodevRpc),
    client: publicClient,
    // drop `paymaster` to have the account pay its own gas
    paymaster: {
      getPaymasterData: (userOperation) =>
        paymasterClient.sponsorUserOperation({ userOperation }),
    },
  });
}

// `decimals` of the funding token. Quote amounts are base-unit strings, never numbers.
export function printQuote(quote: Quote, decimals: number) {
  console.log(`Quote ${quote.quoteId} (expires ${quote.expiresAt})`);
  console.log("  fund this SRA:", quote.sra);
  console.log(
    "  estimated received:",
    formatUnits(BigInt(quote.estimatedReceiveAmount), decimals)
  );
  if (quote.estimatedShares) console.log("  estimated shares:", quote.estimatedShares);
  if (quote.vaultApy != null) console.log("  vault APY:", `${quote.vaultApy}%`);
  // Fees are route-token base units, not USD. `totalFeeAmount` is null when the chains charge in
  // different tokens, so show the per-chain rows then.
  const { totalFeeAmount, totalFeeToken, perChain } = quote.estimatedFees;
  if (totalFeeAmount) console.log("  fees:", totalFeeAmount, "of", totalFeeToken);
  else console.log("  fees per chain:", JSON.stringify(perChain));
  console.log(
    `  ${quote.transaction.calls.length} call(s) to sign on chain ${quote.transaction.chainId}`
  );
}

// Typed errors carry a stable `code` and `details`. Branch on the code, not the message.
function explainError(e: unknown): string {
  if (e instanceof EarnError) {
    const details = e.details ? ` ${JSON.stringify(e.details)}` : "";
    const requestId = e.requestId ? ` (requestId ${e.requestId})` : "";
    return `[${e.code}] ${e.message}${details}${requestId}`;
  }
  return e instanceof Error ? e.message : String(e);
}

export function run(main: () => Promise<void>) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(explainError(e));
      process.exit(1);
    });
}
