import "dotenv/config";
import { KERNEL_V3_2, getEntryPoint } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { type Hex, type Chain, createPublicClient, http, zeroAddress } from "viem";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createIntentClient, INTENT_V0_2, INTENT_V0_3 } from "@zerodev/intent";
import { sepolia } from "viem/chains";
import { getIntentExecutorPluginData } from "@zerodev/intent";

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY is not set");
}

const timeout = 100_000;
const privateKey = process.env.PRIVATE_KEY as Hex;
const account = privateKeyToAccount(privateKey);

const chain = sepolia;
const bundlerRpc = process.env.BUNDLER_RPC as string;
const paymasterRpc = process.env.PAYMASTER_RPC as string;
const publicClient = createPublicClient({
  chain,
  transport: http(),
});

async function getIntentClient(chain: Chain) {
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
    pluginMigrations: [getIntentExecutorPluginData(INTENT_V0_3)],
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(paymasterRpc, { timeout }),
  });

  const intentClient = createIntentClient({
    account: kernelAccount,
    chain,
    bundlerTransport: http(bundlerRpc, { timeout }),
    paymaster: {
      getPaymasterData: async (userOperation) => {
        return await paymasterClient.sponsorUserOperation({
          userOperation,
        });
      },
    },
    version: INTENT_V0_3,
  });
  return intentClient;
}

async function main() {
  const intentClient = await getIntentClient(chain);

  const uoHash = await intentClient.sendUserOperation({
    callData: await intentClient.account.encodeCalls([
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  });
  console.log("uoHash", uoHash);

  const receipt = await intentClient.waitForUserOperationReceipt({
    hash: uoHash,
  });

  console.log(receipt.receipt.transactionHash);

  process.exit(0);
}
main();
