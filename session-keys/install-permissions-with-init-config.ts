import "dotenv/config";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { toInitConfig, toPermissionValidator } from "@zerodev/permissions";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import { toECDSASigner } from "@zerodev/permissions/signers";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_3 } from "@zerodev/sdk/constants";
import { createPublicClient, zeroAddress } from "viem";
import { http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const chain = sepolia;
const ZERODEV_RPC = `${process.env.ZERODEV_RPC}/${chain.id}`;
const publicClient = createPublicClient({
  chain,
  transport: http(ZERODEV_RPC),
});

const signer = privateKeyToAccount(generatePrivateKey());
const kernelVersion = KERNEL_V3_3;

const entryPoint = getEntryPoint("0.7");
const main = async () => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    entryPoint,
    signer,
    kernelVersion,
  });

  const sessionKeySigner = privateKeyToAccount(generatePrivateKey());
  const ecdsaModularSigner = await toECDSASigner({
    signer: sessionKeySigner,
  });

  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint,
    signer: ecdsaModularSigner,
    policies: [
      // In this example, we are just using a sudo policy to allow everything.
      // In practice, you would want to set more restrictive policies.
      toSudoPolicy({}),
    ],
    kernelVersion,
  });

  const masterAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
    },
    kernelVersion,
    initConfig: await toInitConfig(permissionPlugin),
  });

  const kernelPaymaster = createZeroDevPaymasterClient({
    chain,
    transport: http(ZERODEV_RPC),
  });
  const kernelClient = createKernelAccountClient({
    account: masterAccount,
    chain,
    bundlerTransport: http(ZERODEV_RPC),
    paymaster: {
      getPaymasterData(userOperation) {
        return kernelPaymaster.sponsorUserOperation({ userOperation });
      },
    },
  });

  const userOpHash = await kernelClient.sendUserOperation({
    calls: [
      {
        to: zeroAddress,
        data: "0x",
      },
    ],
  });

  console.log("User operation hash:", userOpHash);

  const userOpReceipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log(
    "User operation receipt:",
    `${chain.blockExplorers?.default.url}/tx/${userOpReceipt.receipt.transactionHash}`
  );

  process.exit(0);
};

main();
