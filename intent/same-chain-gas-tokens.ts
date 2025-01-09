import { KERNEL_V3_2, getEntryPoint } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  type Hex,
  type Chain,
  createPublicClient,
  http,
  zeroAddress,
  parseUnits,
  erc20Abi,
  formatUnits,
} from "viem";
import { createKernelAccount } from "@zerodev/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { createIntentClient, installIntentExecutor, INTENT_V0_2 } from "@zerodev/intent";
import { base } from "viem/chains";

if (!process.env.PRIVATE_KEY || !process.env.BASE_PROJECT_ID) {
  throw new Error("PRIVATE_KEY or BASE_PROJECT_ID is not set");
}

const timeout = 100_000;
const privateKey = process.env.PRIVATE_KEY as Hex;
const account = privateKeyToAccount(privateKey);

const chain = base;
const bundlerRpc = process.env.BUNDLER_RPC as string;

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

const waitForUserInput = async () => {
  return new Promise<void>((resolve) => {
    process.stdin.once("data", () => {
      resolve();
    });
  });
};

async function createIntentClinet(chain: Chain) {
  // set kernel and entryPoint version
  const entryPoint = getEntryPoint("0.7");
  const kernelVersion = KERNEL_V3_2;

  // create ecdsa validator
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: account,
    kernelVersion,
    entryPoint,
  });

  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    kernelVersion,
    entryPoint,
    initConfig: [installIntentExecutor(INTENT_V0_2)],
  });

  // the cabclient can be used to send normal userOp and cross-chain cab tx
  const intentClient = createIntentClient({
    account: kernelAccount,
    chain,
    bundlerTransport: http(bundlerRpc, { timeout }),
    version: INTENT_V0_2,
  });

  return intentClient;
}

async function main() {
  const intentClient = await createIntentClinet(chain);

  while (true) {
    console.log(
      `Please deposit USDC to ${intentClient.account.address} on Arbitrum.`
    );
    await waitForUserInput();
    const balance = await publicClient.readContract({
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [intentClient.account.address],
    });
    if (balance >= parseUnits("0.1", 6)) {
      break;
    }
    console.log(
      `Insufficient USDC balance: ${formatUnits(
        balance,
        6
      )}. Please deposit at least 0.1 USDC.`
    );
  }

  // send the intent
  console.log("start sending UserIntent");
  const result = await intentClient.sendUserIntent({
    calls: [
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      }, 
    ],
    gasTokens: [
      {
        chainId: chain.id,
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on arb
      },
    ],
    chainId: chain.id,
  });
  console.log(`succesfully send cab tx, intentId: ${result.uiHash}`);

  const receipt = await intentClient.waitForUserIntentExecutionReceipt({
    uiHash: result.uiHash,
  });
  console.log(
    `txHash on destination chain: ${receipt?.executionChainId} txHash: ${receipt?.receipt.transactionHash}`
  );
  process.exit(0);
}
main();
