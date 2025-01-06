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
  concatHex,
  zeroAddress,
  encodeAbiParameters,
  parseAbiParameters
} from "viem";
import { createKernelAccount, KernelV3_1AccountAbi } from "@zerodev/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { createIntentClient, installIntentExecutor, INTENT_V0_2 } from "@zerodev/intent";
import { arbitrumSepolia, baseSepolia } from "viem/chains";

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY is not set");
}

const timeout = 100_000;
const privateKey = process.env.PRIVATE_KEY as Hex;
const account = privateKeyToAccount(privateKey);

const chain = baseSepolia;
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
  const intentExecutor = '0xAd8da92Dd670871bD3f90475d6763d520728881a';

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
    initConfig: [
      encodeFunctionData({
        abi: KernelV3_1AccountAbi,
        functionName: "installModule",
        args: [
          BigInt(2),
          intentExecutor,
          concatHex([
            zeroAddress,
            encodeAbiParameters(parseAbiParameters(["bytes", "bytes"]), ["0x", "0x"]),
          ]),
        ],
      })
    ],
  });

  // the cabclient can be used to send normal userOp and cross-chain cab tx
  const intentClient = createIntentClient({
    account: kernelAccount,
    chain,
    bundlerTransport: http(bundlerRpc, { timeout }),
    version: INTENT_V0_2,
    relayerTransport: http('https://relayer-testnet.onrender.com', { timeout }),
    intentTransport: http('https://user-intent-service.onrender.com/intent', { timeout }),
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
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [intentClient.account.address],
    });
    if (balance >= parseUnits("0.01", 6)) {
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
    gasToken: {
      chainId: chain.id,
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on arb
    },
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
