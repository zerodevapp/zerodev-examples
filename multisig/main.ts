import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk";
import { http, Hex, createPublicClient, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createWeightedECDSAValidator } from "@zerodev/weighted-ecdsa-validator";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";

if (
  !process.env.BUNDLER_RPC ||
  !process.env.PAYMASTER_RPC ||
  !process.env.PRIVATE_KEY
) {
  throw new Error("BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY is not set");
}

const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
  chain: sepolia,
});

const signer1 = privateKeyToAccount(generatePrivateKey());
const signer2 = privateKeyToAccount(generatePrivateKey());
const signer3 = privateKeyToAccount(generatePrivateKey());
export const entryPoint = getEntryPoint("0.7");

const main = async () => {
  const multisigValidator = await createWeightedECDSAValidator(publicClient, {
    entryPoint,
    config: {
      threshold: 100,
      signers: [
        { address: signer1.address, weight: 100 },
        { address: signer2.address, weight: 50 },
        { address: signer3.address, weight: 50 },
      ],
    },
    signers: [signer2, signer3],
    kernelVersion: KERNEL_V3_1,
  });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: multisigValidator,
    },
    kernelVersion: KERNEL_V3_1,
  });

  const kernelPaymaster = createZeroDevPaymasterClient({
    entryPoint,
    chain: sepolia,
    transport: http(process.env.PAYMASTER_RPC),
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain: sepolia,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    paymaster: kernelPaymaster,
  });

  console.log("My account:", kernelClient.account.address);

  const userOpHash = await kernelClient.sendUserOperation({
    callData: await account.encodeCalls([
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  });

  console.log("userOp hash:", userOpHash);

  await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log("UserOp completed!");
};

main();
