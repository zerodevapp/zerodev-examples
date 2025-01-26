// Utilities for examples

import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  KernelSmartAccountV1Implementation, createKernelAccount,
  createKernelAccountClient,
  createKernelAccountV1,
  createZeroDevPaymasterClient,
  getUserOperationGasPrice
} from "@zerodev/sdk";
import { getEntryPoint } from "@zerodev/sdk/constants";
import { GetKernelVersion } from "@zerodev/sdk/types";
import { Hex, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  EntryPointVersion,
  PaymasterActions,
  SmartAccount,
} from "viem/account-abstraction";

const zeroDevProjectId = process.env.ZERODEV_PROJECT_ID;
const privateKey = process.env.PRIVATE_KEY;
if (!zeroDevProjectId || !privateKey) {
  throw new Error("ZERODEV_PROJECT_ID or PRIVATE_KEY is not set");
}

const signer = privateKeyToAccount(privateKey as Hex);
const chain = baseSepolia;
const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
  chain,
});

export const getKernelClient = async <
  entryPointVersion extends EntryPointVersion
>(
  entryPointVersion_: entryPointVersion,
  kernelVersion: GetKernelVersion<entryPointVersion>
) => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint: getEntryPoint(entryPointVersion_),
    kernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint: getEntryPoint(entryPointVersion_),
    kernelVersion,
  });
  console.log("My account:", account.address);
  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(process.env.PAYMASTER_RPC),
  });
  return createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    paymaster: paymasterClient,
    client: publicClient,
    userOperation: {
      estimateFeesPerGas: async ({ bundlerClient }) => {
        return getUserOperationGasPrice(bundlerClient);
      },
    },
  });
};

export const getKernelV1Account = async () => {
  const privateKey = process.env.PRIVATE_KEY as Hex;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY environment variable not set");
  }

  const rpcUrl = process.env.BUNDLER_RPC;
  if (!rpcUrl) {
    throw new Error("BUNDLER_RPC environment variable not set");
  }

  const publicClient = createPublicClient({
    transport: http(rpcUrl),
    chain,
  });
  const signer = privateKeyToAccount(privateKey);

  return createKernelAccountV1(publicClient, {
    signer,
    index: BigInt(0),
    entryPoint: getEntryPoint("0.6"),
  });
};

export const getKernelV1AccountClient = async ({
  account,
  paymaster,
}: {
  paymaster?: {
    /** Retrieves paymaster-related User Operation properties to be used for sending the User Operation. */
    getPaymasterData?: PaymasterActions["getPaymasterData"] | undefined;
    /** Retrieves paymaster-related User Operation properties to be used for gas estimation. */
    getPaymasterStubData?: PaymasterActions["getPaymasterStubData"] | undefined;
  };
  account: SmartAccount<KernelSmartAccountV1Implementation>;
}) => {
  const zeroDevBundlerRpcHost = process.env.BUNDLER_RPC;
  return createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(zeroDevBundlerRpcHost),
    paymaster,
  });
};

export const getZeroDevPaymasterClient = () => {
  if (!process.env.PAYMASTER_RPC)
    throw new Error("PAYMASTER_RPC environment variable not set");

  const paymasterRpc = process.env.PAYMASTER_RPC;

  return createZeroDevPaymasterClient({
    chain,
    transport: http(paymasterRpc),
  });
};

export const getZeroDevERC20PaymasterClient = () => {
  if (!process.env.ZERODEV_PROJECT_ID)
    throw new Error("ZERODEV_PROJECT_ID environment variable not set");

  return createZeroDevPaymasterClient({
    chain,
    transport: http(
      process.env.PAYMASTER_RPC ||
      "https://rpc.zerodev.app/api/v2/paymaster/" +
      process.env.ZERODEV_PROJECT_ID
    ),
  });
};
