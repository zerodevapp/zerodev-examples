import "dotenv/config";
import { KERNEL_V3_2, getEntryPoint } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  formatUnits,
  erc20Abi,
  parseUnits,
  type Hex,
  type Chain,
  createPublicClient,
  http,
  encodeFunctionData,
} from "viem";
import { createKernelAccount } from "@zerodev/sdk";
import { privateKeyToAccount } from "viem/accounts";
import {
  createIntentClient,
  installIntentExecutor,
  INTENT_V0_1,
} from "@zerodev/intent";
import { arbitrum, base } from "viem/chains";

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY is not set");
}

const timeout = 100_000;
const privateKey = process.env.PRIVATE_KEY as Hex;
const account = privateKeyToAccount(privateKey);

const chain = arbitrum;
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

  //
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    kernelVersion,
    entryPoint,
    initConfig: [installIntentExecutor(INTENT_V0_1)],
  });

  // the cabclient can be used to send normal userOp and cross-chain cab tx
  const intentClient = createIntentClient({
    account: kernelAccount,
    chain,
    bundlerTransport: http(bundlerRpc, { timeout }),
    version: INTENT_V0_1,
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
    const cab = await intentClient.getCAB({
      networks: [arbitrum.id, base.id],
      tokenTickers: ["USDC"],
    });
    if (BigInt(cab.tokens[0].amount) >= parseUnits("0.7", 6)) {
      break;
    } 
    console.log(
      `Insufficient USDC balance: ${formatUnits(
        BigInt(cab.tokens[0].amount),
        6
      )}. Please deposit at least 0.7 USDC.`
    );
  }

  // Get chain-abstracted balance
  const cab = await intentClient.getCAB({
    networks: [arbitrum.id, base.id],
    tokenTickers: ["USDC"],
  });
  console.log("Chain abstracted balance (CAB):", cab);

  // send the intent
  console.log("start sending UserIntent");
  const result = await intentClient.sendUserIntent({
    calls: [
      {
        to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        value: BigInt(0),
        // send output amount to eoa address
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [account.address, parseUnits("0.6", 6)],
        }),
      },
    ], 
    outputTokens: [
      {
        chainId: base.id,
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on base
        amount: parseUnits("0.6", 6), // 0.6 USDC
      },
    ],
    gasTokens: 'CAB'
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
