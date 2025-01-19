import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
  getUserOperationGasPrice,
} from "@zerodev/sdk";
import { createEcdsaKernelMigrationAccount, signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { http, Hex, createPublicClient, zeroAddress, Address, isAddressEqual } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { KERNEL_V3_0, KERNEL_V3_1, KernelVersionToAddressesMap } from "@zerodev/sdk/constants";
import {
  entryPoint07Address,
  EntryPointVersion,
} from "viem/account-abstraction";
import { getKernelImplementationAddress, getKernelVersion } from "@zerodev/sdk/actions";

if (
  !process.env.BUNDLER_RPC ||
  !process.env.PAYMASTER_RPC ||
  !process.env.PRIVATE_KEY
) {
  throw new Error("BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY is not set");
}

const chain = sepolia;
const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
  chain,
});

const signer = privateKeyToAccount(generatePrivateKey() as Hex);
const entryPoint = {
  address: entryPoint07Address as Address,
  version: "0.7" as EntryPointVersion,
};

const main = async () => {
  const originalKernelVersion = KERNEL_V3_0;
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion: originalKernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion: originalKernelVersion,
  });
  console.log("My account:", account.address);

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(process.env.PAYMASTER_RPC),
  });
  const kernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    client: publicClient,
    paymaster: paymasterClient,
  });

  // Sending a dummy transaction just to deploy the account but not not needed for the migration
  // If the account is not deployed, the migration will still keep the same address as the one generated by the original kernel version
  // but the kernel version will be the migrated one
  const txHash = await kernelClient.sendTransaction({
    to: zeroAddress,
    value: BigInt(0),
    data: "0x",
  });
  console.log("txHash:", txHash);

  const kernelVersion = await getKernelVersion(publicClient, {
    address: account.address
  })
  console.log("Kernel version before migration:", kernelVersion);


  const migrationVersion = KERNEL_V3_1;

  const migrationAccount = await createEcdsaKernelMigrationAccount(publicClient, {
    entryPoint,
    signer,
    migrationVersion: {
        from: originalKernelVersion,
        to: migrationVersion,
    },
  });

  const migrationKernelClient = createKernelAccountClient({
    account: migrationAccount,
    chain,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    client: publicClient,
    paymaster: paymasterClient,
    userOperation: {
      estimateFeesPerGas: async ({ bundlerClient }) => {
        return getUserOperationGasPrice(bundlerClient);
      },
    },
  });

  // The first transaction from the migration account will be the one that will migrate the account
  const migrationTxHash = await migrationKernelClient.sendTransaction({
    to: zeroAddress,
    value: BigInt(0),
    data: "0x",
  });
  console.log("migrationTxHash:", migrationTxHash);

  const migrationKernelVersion = await getKernelVersion(publicClient, {
    address: migrationAccount.address
  })
  console.log("Kernel version after migration:", migrationKernelVersion);

};

main();