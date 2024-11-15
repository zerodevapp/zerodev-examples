import dotenv from "dotenv";
import {
  ecdsaSignUserOpsWithEnable,
  toMultiChainECDSAValidator,
} from "@zerodev/multi-chain-ecdsa-validator";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { Hex, createPublicClient, http, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { optimismSepolia, sepolia } from "viem/chains";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import { toPermissionValidator } from "@zerodev/permissions";
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
    }
  );
  const optimismSepoliaMultiSigECDSAValidatorPlugin =
    await toMultiChainECDSAValidator(optimismSepoliaPublicClient, {
      entryPoint,
      signer,
      kernelVersion: KERNEL_V3_1,
    });

  const sepoliaEcdsaSigner = privateKeyToAccount(generatePrivateKey());
  const sepoliaEcdsaModularSigner = await toECDSASigner({
    signer: sepoliaEcdsaSigner,
  });

  const optimismSepoliaEcdsaSigner = privateKeyToAccount(generatePrivateKey());
  const optimismSepoliaEcdsaModularSigner = await toECDSASigner({
    signer: optimismSepoliaEcdsaSigner,
  });

  const sudoPolicy = toSudoPolicy({});

  const sepoliaPermissionPlugin = await toPermissionValidator(
    sepoliaPublicClient,
    {
      entryPoint,
      signer: sepoliaEcdsaModularSigner,
      policies: [sudoPolicy],
      kernelVersion: KERNEL_V3_1,
    }
  );

  const optimismSepoliaPermissionPlugin = await toPermissionValidator(
    optimismSepoliaPublicClient,
    {
      entryPoint,
      signer: optimismSepoliaEcdsaModularSigner,
      policies: [sudoPolicy],
      kernelVersion: KERNEL_V3_1,
    }
  );

  const sepoliaKernelAccount = await createKernelAccount(sepoliaPublicClient, {
    entryPoint,
    plugins: {
      sudo: sepoliaMultiSigECDSAValidatorPlugin,
      regular: sepoliaPermissionPlugin,
    },
    kernelVersion: KERNEL_V3_1,
  });

  const optimismSepoliaKernelAccount = await createKernelAccount(
    optimismSepoliaPublicClient,
    {
      entryPoint,
      plugins: {
        sudo: optimismSepoliaMultiSigECDSAValidatorPlugin,
        regular: optimismSepoliaPermissionPlugin,
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

  // signUserOpsWithEnable will configure the signature as a combination of enable signatures and actual user operation signatures.
  const signedUserOps = await ecdsaSignUserOpsWithEnable({
    multiChainUserOpConfigsForEnable: [
      {
        account: sepoliaKernelAccount,
        userOp: sepoliaUserOp,
      },
      {
        account: optimismSepoliaKernelAccount,
        userOp: optimismSepoliaUserOp,
      },
    ],
  });

  // You should send the signed user operations to enable the regular validator with bundler client.
  const sepoliaUserOpHash = await sepoliaZerodevKernelClient.sendUserOperation({
    ...signedUserOps[0],
  });

  console.log("sepoliaUserOpHash", sepoliaUserOpHash);
  await sepoliaZerodevKernelClient.waitForUserOperationReceipt({
    hash: sepoliaUserOpHash,
  });

  const optimismSepoliaUserOpHash =
    await optimismSepoliaZerodevKernelClient.sendUserOperation({
      ...signedUserOps[1],
    });

  console.log("optimismSepoliaUserOpHash", optimismSepoliaUserOpHash);
  await optimismSepoliaZerodevKernelClient.waitForUserOperationReceipt({
    hash: optimismSepoliaUserOpHash,
  });

  // now you can use sendTransaction or sendUserOperation since you've already enabled the regular validator, which is permission here.
  const sepoliaTxHash = await sepoliaZerodevKernelClient.sendTransaction({
    to: zeroAddress,
    value: BigInt(0),
    data: "0x",
  });
  console.log("sepoliaTxHash", sepoliaTxHash);

  const optimismSepoliaTxHash =
    await optimismSepoliaZerodevKernelClient.sendTransaction({
      to: zeroAddress,
      value: BigInt(0),
      data: "0x",
    });
  console.log("optimismSepoliaTxHash", optimismSepoliaTxHash);
};

main();
