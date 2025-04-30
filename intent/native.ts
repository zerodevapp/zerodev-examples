import "dotenv/config";
import { KERNEL_V3_2, getEntryPoint } from "@zerodev/sdk/constants";
import { toMultiChainECDSAValidator } from "@zerodev/multi-chain-ecdsa-validator";
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
  INTENT_V0_4,
} from "@zerodev/intent";
import { arbitrum, base } from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.PRIVATE_KEY || !process.env.ZERODEV_RPC) {
  throw new Error("PRIVATE_KEY or ZERODEV_RPC is not set");
}

const timeout = 100_000;
const privateKey = process.env.PRIVATE_KEY as Hex;
const account = privateKeyToAccount(privateKey);

const chain = arbitrum;
const zerodevRpc = process.env.ZERODEV_RPC as string;

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
  const ecdsaValidator = await toMultiChainECDSAValidator(publicClient, {
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
    initConfig: [installIntentExecutor(INTENT_V0_4)],
  });

  // the cabclient can be used to send normal userOp and cross-chain cab tx
  const intentClient = createIntentClient({
    account: kernelAccount,
    chain,
    bundlerTransport: http(zerodevRpc, { timeout }),
    version: INTENT_V0_4,
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
    if (BigInt(cab.tokens[0].amount) >= parseUnits("0.1", 6)) {
      break;
    } 
    console.log(
      `Insufficient USDC balance: ${formatUnits(
        BigInt(cab.tokens[0].amount),
        6
      )}. Please deposit at least 0.1 USDC.`
    );
  }

  // Get chain-abstracted balance
  const cab = await intentClient.getCAB({
    networks: [arbitrum.id, base.id],
    tokenTickers: ["USDC"],
  });
  console.log("Chain abstracted balance (CAB):", cab);

  // send the intent with native token gas payment
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
          args: [account.address, parseUnits("0.1", 6)],
        }),
      },
    ], 
    outputTokens: [
      {
        chainId: base.id,
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on base
        amount: parseUnits("0.1", 6),
      },
    ],
    gasToken: 'NATIVE' // Explicitly use native tokens (ETH) for gas payment
  });
  console.log(`successfully send cab tx, intentId: ${result.outputUiHash.uiHash}`);

  // wait for the intent to be opened on the input chains
  await Promise.all(
    result.inputsUiHash.map(async (data) => {
      const openReceipts =  await intentClient.waitForUserIntentOpenReceipt({
        uiHash: data.uiHash,
      });
      console.log(`intent open on chain ${openReceipts?.openChainId} txHash: ${openReceipts?.receipt.transactionHash}`);
    })
  );

  // wait for the intent to be executed on the destination chain
  const receipt = await intentClient.waitForUserIntentExecutionReceipt({
    uiHash: result.outputUiHash.uiHash,
  });
  console.log(
    `intent executed on chain: ${receipt?.executionChainId} txHash: ${receipt?.receipt.transactionHash}`
  );
  process.exit(0);
}
main();
