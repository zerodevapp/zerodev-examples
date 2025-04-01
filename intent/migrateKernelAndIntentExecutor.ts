import "dotenv/config";
import { type Hex, type Chain, createPublicClient, http, zeroAddress, parseUnits, encodeFunctionData, erc20Abi } from "viem";
import { KERNEL_V3_1, KERNEL_V3_2, getEntryPoint } from "@zerodev/sdk/constants";
import { createZeroDevPaymasterClient } from "@zerodev/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { createEcdsaKernelMigrationAccount } from "@zerodev/ecdsa-validator";
import { createIntentClient, INTENT_V0_3, getIntentExecutorPluginData } from "@zerodev/intent";
import { base } from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.PRIVATE_KEY || !process.env.ZERODEV_RPC) {
  throw new Error("PRIVATE_KEY or ZERODEV_RPC is not set");
}

const timeout = 100_000;
const privateKey = process.env.PRIVATE_KEY as Hex;
const account = privateKeyToAccount(privateKey);

const chain = base;
const zerodevRpc = process.env.ZERODEV_RPC as string;
const publicClient = createPublicClient({
  chain,
  transport: http(),
});

async function getIntentClient(chain: Chain) {
  // set kernel and entryPoint version
  const entryPoint = getEntryPoint("0.7");
  const kernelVersion = KERNEL_V3_1;
  const migrationVersion = KERNEL_V3_2;

  // create migration kernel account, replace `createKernelAccount` with `createEcdsaKernelMigrationAccount`
  const kernelAccount = await createEcdsaKernelMigrationAccount(publicClient, {
    entryPoint,
    signer: account,
    migrationVersion: {
      from: kernelVersion,
      to: migrationVersion,
    },
    pluginMigrations: [getIntentExecutorPluginData(INTENT_V0_3)],
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(zerodevRpc, { timeout }),
  });

  const intentClient = createIntentClient({
    account: kernelAccount,
    chain,
    bundlerTransport: http(zerodevRpc, { timeout }),
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

  // NOTE: Send migration transactions on all chains
  const userOpHash = await intentClient.sendUserOperation({
    callData: await intentClient.account.encodeCalls([
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  });
  console.log(`migration userOpHash: ${userOpHash} on chain ${chain.id}`);

  const receipt = await intentClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log('migration txHash', receipt.receipt.transactionHash);

  // Send the intent
  const outputToken = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  const outputChainId = base.id
  const amount = parseUnits("0.19", 6)
  const result = await intentClient.sendUserIntent({
    calls: [
      {
        to: outputToken,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [account.address, amount],
        }),
      },
    ],
    outputTokens: [
      {
        address: outputToken,
        chainId: outputChainId,
        amount: amount,
      },
    ],
  });
  console.log(`succesfully send cab tx, intentId: ${result.outputUiHash.uiHash}`);

  // wait for the intent to be opened on the input chains
  await Promise.all(
    result.inputsUiHash.map(async (data) => {
      const openReceipts =  await intentClient.waitForUserIntentOpenReceipt({
        uiHash: data.uiHash,
      });
      console.log(`intent open on chain ${openReceipts?.openChainId} txHash: ${openReceipts?.receipt?.transactionHash}`);
    })
  );

  // wait for the intent to be executed on the destination chain
  const intentReceipt = await intentClient.waitForUserIntentExecutionReceipt({
    uiHash: result.outputUiHash.uiHash,
  });
  console.log(
    `intent executed on chain: ${intentReceipt?.executionChainId} txHash: ${intentReceipt?.receipt?.transactionHash}`
  );

  process.exit(0);
}
main();
