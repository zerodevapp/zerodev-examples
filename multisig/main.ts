import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk";
import {
  ENTRYPOINT_ADDRESS_V07,
  UserOperation,
  bundlerActions,
} from "permissionless";
import { http, Hex, createPublicClient, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createWeightedECDSAValidator } from "@zerodev/weighted-ecdsa-validator";

if (
  !process.env.BUNDLER_RPC ||
  !process.env.PAYMASTER_RPC ||
  !process.env.PRIVATE_KEY
) {
  throw new Error("BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY is not set");
}

const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
});

const signer1 = privateKeyToAccount(generatePrivateKey());
const signer2 = privateKeyToAccount(generatePrivateKey());
const signer3 = privateKeyToAccount(generatePrivateKey());
export const entryPoint = ENTRYPOINT_ADDRESS_V07;

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
  });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: multisigValidator,
    },
  });

  const kernelPaymaster = createZeroDevPaymasterClient({
    entryPoint,
    chain: sepolia,
    transport: http(process.env.PAYMASTER_RPC),
  });

  const kernelClient = createKernelAccountClient({
    entryPoint,
    account,
    chain: sepolia,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    middleware: {
      sponsorUserOperation: kernelPaymaster.sponsorUserOperation,
    },
  });

  console.log("My account:", kernelClient.account.address);

  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await account.encodeCallData({
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      }),
    },
  });

  console.log("userOp hash:", userOpHash);

  const bundlerClient = kernelClient.extend(bundlerActions(entryPoint));
  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log("UserOp completed!");
};

main();
