import dotenv from "dotenv";
import {
  signUserOperations,
  toMultiChainECDSAValidator,
} from "@zerodev/multi-chain-ecdsa-validator";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { Hex, createPublicClient, http, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { optimismSepolia, sepolia } from "viem/chains";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";

dotenv.config();

if (
  !process.env.PRIVATE_KEY ||
  !process.env.RPC_URL ||
  !process.env.OPTIMISM_SEPOLIA_RPC_URL ||
  !process.env.BUNDLER_RPC ||
  !process.env.PAYMASTER_RPC ||
  !process.env.OPTIMISM_SEPOLIA_BUNDLER_RPC_URL ||
  !process.env.OPTIMISM_SEPOLIA_PAYMASTER_RPC_URL
) {
  console.error(
    "Please set PRIVATE_KEY, RPC_URL, OPTIMISM_SEPOLIA_RPC_URL, BUNDLER_RPC, PAYMASTER_RPC, OPTIMISM_SEPOLIA_BUNDLER_RPC_URL, OPTIMISM_SEPOLIA_PAYMASTER_RPC_URL"
  );
  process.exit(1);
}

const PRIVATE_KEY = process.env.PRIVATE_KEY;

const SEPOLIA_RPC_URL = process.env.RPC_URL;
const OPTIMISM_SEPOLIA_RPC_URL = process.env.OPTIMISM_SEPOLIA_RPC_URL;

const SEPOLIA_ZERODEV_RPC_URL = process.env.BUNDLER_RPC;
const SEPOLIA_ZERODEV_PAYMASTER_RPC_URL = process.env.PAYMASTER_RPC;

const OPTIMISM_SEPOLIA_ZERODEV_RPC_URL =
  process.env.OPTIMISM_SEPOLIA_BUNDLER_RPC_URL;
const OPTIMISM_SEPOLIA_ZERODEV_PAYMASTER_RPC_URL =
  process.env.OPTIMISM_SEPOLIA_PAYMASTER_RPC_URL;

const entryPoint = getEntryPoint("0.7");

const main = async () => {
  const sepoliaPublicClient = createPublicClient({
    transport: http(SEPOLIA_RPC_URL),
    chain: sepolia,
  });
  const optimismSepoliaPublicClient = createPublicClient({
    transport: http(OPTIMISM_SEPOLIA_RPC_URL),
    chain: optimismSepolia,
  });

  const signer = privateKeyToAccount(PRIVATE_KEY as Hex);
  const sepoliaMultiSigECDSAValidatorPlugin = await toMultiChainECDSAValidator(
    sepoliaPublicClient,
    {
      entryPoint,
      signer,
      kernelVersion: KERNEL_V3_1,
      multiChainIds: [sepolia.id, optimismSepolia.id],
    }
  );
  const optimismSepoliaMultiSigECDSAValidatorPlugin =
    await toMultiChainECDSAValidator(optimismSepoliaPublicClient, {
      entryPoint,
      signer,
      kernelVersion: KERNEL_V3_1,
      multiChainIds: [sepolia.id, optimismSepolia.id],
    });

  const sepoliaKernelAccount = await createKernelAccount(sepoliaPublicClient, {
    entryPoint,
    plugins: {
      sudo: sepoliaMultiSigECDSAValidatorPlugin,
    },
    kernelVersion: KERNEL_V3_1,
  });

  const optimismSepoliaKernelAccount = await createKernelAccount(
    optimismSepoliaPublicClient,
    {
      entryPoint,
      plugins: {
        sudo: optimismSepoliaMultiSigECDSAValidatorPlugin,
      },
      kernelVersion: KERNEL_V3_1,
    }
  );

  console.log("sepoliaKernelAccount.address", sepoliaKernelAccount.address);
  console.log(
    "optimismSepoliaKernelAccount.address",
    optimismSepoliaKernelAccount.address
  );

  const sepoliaZeroDevPaymasterClient = createZeroDevPaymasterClient({
    chain: sepolia,
    transport: http(SEPOLIA_ZERODEV_PAYMASTER_RPC_URL),
    entryPoint,
  });

  const opSepoliaZeroDevPaymasterClient = createZeroDevPaymasterClient({
    chain: optimismSepolia,
    transport: http(OPTIMISM_SEPOLIA_ZERODEV_PAYMASTER_RPC_URL),
    entryPoint,
  });

  const sepoliaZerodevKernelClient = createKernelAccountClient({
    account: sepoliaKernelAccount,
    chain: sepolia,
    bundlerTransport: http(SEPOLIA_ZERODEV_RPC_URL),
    paymaster: sepoliaZeroDevPaymasterClient,
  });

  const optimismSepoliaZerodevKernelClient = createKernelAccountClient({
    account: optimismSepoliaKernelAccount,
    chain: optimismSepolia,
    bundlerTransport: http(OPTIMISM_SEPOLIA_ZERODEV_RPC_URL),
    paymaster: opSepoliaZeroDevPaymasterClient,
  });

  const sepoliaUserOp = await sepoliaZerodevKernelClient.prepareUserOperation({
    callData: await sepoliaKernelAccount.encodeCalls([
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  });

  const optimismSepoliaUserOp =
    await optimismSepoliaZerodevKernelClient.prepareUserOperation({
      callData: await optimismSepoliaKernelAccount.encodeCalls([
        {
          to: zeroAddress,
          value: BigInt(0),
          data: "0x",
        },
      ]),
    });

  const signedUserOps = await signUserOperations(sepoliaZerodevKernelClient, {
    account: sepoliaKernelAccount,
    userOperations: [
      { ...sepoliaUserOp, chainId: sepolia.id },
      {
        ...optimismSepoliaUserOp,
        chainId: optimismSepolia.id,
      },
    ],
  });

  console.log("sending sepoliaUserOp");
  // you should use bundler client to send signed user ops
  const sepoliaUserOpHash = await sepoliaZerodevKernelClient.sendUserOperation({
    ...signedUserOps[0],
  });

  console.log("sepoliaUserOpHash", sepoliaUserOpHash);
  await sepoliaZerodevKernelClient.waitForUserOperationReceipt({
    hash: sepoliaUserOpHash,
  });

  console.log("sending optimismSepoliaUserOp");
  const optimismSepoliaUserOpHash =
    await optimismSepoliaZerodevKernelClient.sendUserOperation({
      ...signedUserOps[1],
    });

  console.log("optimismSepoliaUserOpHash", optimismSepoliaUserOpHash);
  await optimismSepoliaZerodevKernelClient.waitForUserOperationReceipt({
    hash: optimismSepoliaUserOpHash,
  });
};

main();
