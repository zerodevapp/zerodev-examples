import "dotenv/config";
import {
  KERNEL_V3_0,
  KERNEL_V3_2,
  getEntryPoint,
} from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { Address, type Chain, createPublicClient, http, zeroAddress } from "viem";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createIntentClient, INTENT_V0_3 } from "@zerodev/intent";
import { arbitrum, sepolia } from "viem/chains";
import { SmartAccount } from "viem/account-abstraction";

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY is not set");
}

const timeout = 100_000;
const chain = arbitrum;
const bundlerRpc = process.env.BUNDLER_RPC as string;
const paymasterRpc = process.env.PAYMASTER_RPC as string;
// For testing purposes, we generate a new private key
const privateKey = generatePrivateKey();

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

async function getSigner() {
  return privateKeyToAccount(privateKey);
}

async function createKernelWithV3_0() {
  const signer = await getSigner();

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    kernelVersion: KERNEL_V3_0,
    entryPoint: getEntryPoint("0.7"),
  });

  return createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    kernelVersion: KERNEL_V3_0,
    entryPoint: getEntryPoint("0.7"),
  });
}

async function createIntentClientV3_0(kernelAccount: SmartAccount) {
  return createIntentClient({
    account: kernelAccount,
    chain,
    bundlerTransport: http(bundlerRpc, { timeout }),
    paymaster: createZeroDevPaymasterClient({
      chain,
      transport: http(paymasterRpc, { timeout }),
    }),
    client: publicClient,
    version: INTENT_V0_3
  });
}

async function createKernelWithV3_2(kernelAddress: Address) {
  const signer = await getSigner();

  const v3_2Validator = await signerToEcdsaValidator(publicClient, {
    signer,
    kernelVersion: KERNEL_V3_2,
    entryPoint: getEntryPoint("0.7"),
  });

  return createKernelAccount(publicClient, {
    plugins: {
      sudo: v3_2Validator,
    },
    kernelVersion: KERNEL_V3_2,
    entryPoint: getEntryPoint("0.7"),
    // Important: We pass the address of the existing kernel account because we upgrade the existing kernel account
    address: kernelAddress,
  });
}

async function createIntentClientV3_2(kernelAccount: any) {
  return createIntentClient({
    account: kernelAccount,
    chain,
    bundlerTransport: http(bundlerRpc, { timeout }),
    version: INTENT_V0_3
  });
}

async function verifyUpgrade(upgradedClient: any) {
  console.log("Verifying upgraded V3.2 client...");
  const verifyTx = await upgradedClient.sendTransaction({
    to: zeroAddress,
    data: "0x",
  });
  console.log("Verification transaction hash:", verifyTx.uiHash);
}

async function main() {
  // Create and setup V3.0 kernel
  const kernelAccount = await createKernelWithV3_0();
  console.log("Initial V3.0 kernel account:", kernelAccount.address);

  const intentClient = await createIntentClientV3_0(kernelAccount);

  // Enable intent and upgrade to V3.2
  console.log("Enabling intent and upgrading to V3.2...");
  const enableHash = await intentClient.enableIntent();
  console.log("Enable intent hash:", enableHash);

  const receipt = await intentClient.waitForUserOperationReceipt({
    hash: enableHash,
  });
  console.log("Upgrade transaction:", receipt.receipt.transactionHash);

  // Create and verify V3.2 client
  const v3_2KernelAccount = await createKernelWithV3_2(kernelAccount.address);
  const upgradedClient = await createIntentClientV3_2(v3_2KernelAccount);
  await verifyUpgrade(upgradedClient);

  console.log(
    "Successfully upgraded kernel to V3.2 with intent functionality enabled"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
