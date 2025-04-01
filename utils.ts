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
import { sepolia } from "viem/chains";
import {
  EntryPointVersion,
  PaymasterActions,
  SmartAccount,
} from "viem/account-abstraction";

const privateKey = process.env.PRIVATE_KEY;
if (!process.env.ZERODEV_RPC || !privateKey) {
  throw new Error("ZERODEV_RPC or PRIVATE_KEY is not set");
}

const signer = privateKeyToAccount(privateKey as Hex);
const chain = sepolia;
const publicClient = createPublicClient({
  transport: http(process.env.ZERODEV_RPC),
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
    transport: http(process.env.ZERODEV_RPC),
  });
  return createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(process.env.ZERODEV_RPC),
    paymaster: {
      getPaymasterData: (userOperation) => {
        return paymasterClient.sponsorUserOperation({
          userOperation,
        })
      }
    },
    client: publicClient,
  });
};

export const getKernelV1Account = async () => {
  const privateKey = process.env.PRIVATE_KEY as Hex;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY environment variable not set");
  }

  if (!process.env.ZERODEV_RPC) {
    throw new Error("ZERODEV_RPC environment variable not set");
  }

  const publicClient = createPublicClient({
    transport: http(process.env.ZERODEV_RPC),
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
  if (!process.env.ZERODEV_RPC) {
    throw new Error("ZERODEV_RPC environment variable not set");
  }
  return createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(process.env.ZERODEV_RPC),
    paymaster,
  });
};

export const getZeroDevPaymasterClient = () => {
  if (!process.env.ZERODEV_RPC)
    throw new Error("ZERODEV_RPC environment variable not set");

  return createZeroDevPaymasterClient({
    chain,
    transport: http(process.env.ZERODEV_RPC),
  });
};

export const getZeroDevERC20PaymasterClient = () => {
  if (!process.env.ZERODEV_RPC)
    throw new Error("ZERODEV_RPC environment variable not set");

  return createZeroDevPaymasterClient({
    chain,
    transport: http(process.env.ZERODEV_RPC),
  });
};
