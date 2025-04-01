import dotenv from "dotenv";
import { toMultiChainECDSAValidator } from "@zerodev/multi-chain-ecdsa-validator";
import {
  addressToEmptyAccount,
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { Hex, createPublicClient, http, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { optimismSepolia, sepolia } from "viem/chains";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import {
  deserializePermissionAccount,
  serializeMultiChainPermissionAccounts,
  toPermissionValidator,
} from "@zerodev/permissions";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";

dotenv.config();

if (
  !process.env.PRIVATE_KEY ||
  !process.env.RPC_URL ||
  !process.env.OPTIMISM_SEPOLIA_RPC_URL ||
  !process.env.ZERODEV_RPC ||
  !process.env.OPTIMISM_SEPOLIA_ZERODEV_RPC
) {
  console.error(
    "Please set PRIVATE_KEY, RPC_URL, OPTIMISM_SEPOLIA_RPC_URL, ZERODEV_RPC, OPTIMISM_SEPOLIA_ZERODEV_RPC"
  );
  process.exit(1);
}

const PRIVATE_KEY = process.env.PRIVATE_KEY;

const SEPOLIA_RPC_URL = process.env.RPC_URL;
const OPTIMISM_SEPOLIA_RPC_URL = process.env.OPTIMISM_SEPOLIA_RPC_URL;

const SEPOLIA_ZERODEV_RPC_URL = process.env.ZERODEV_RPC;
const OPTIMISM_SEPOLIA_ZERODEV_RPC_URL = process.env.OPTIMISM_SEPOLIA_ZERODEV_RPC;

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

  const sepoliaSessionKeyAccount = privateKeyToAccount(generatePrivateKey());

  const optimismSepoliaSessionKeyAccount = privateKeyToAccount(
    generatePrivateKey()
  );

  // create an empty account as the session key signer for approvals
  const sepoliaEmptyAccount = addressToEmptyAccount(
    sepoliaSessionKeyAccount.address
  );
  const optimismSepoliaEmptyAccount = addressToEmptyAccount(
    optimismSepoliaSessionKeyAccount.address
  );

  const sepoliaEmptySessionKeySigner = await toECDSASigner({
    signer: sepoliaEmptyAccount,
  });

  const optimismSepoliaEmptySessionKeySigner = await toECDSASigner({
    signer: optimismSepoliaEmptyAccount,
  });

  const sudoPolicy = toSudoPolicy({});

  // create a permission validator plugin with empty account signer
  const sepoliaPermissionPlugin = await toPermissionValidator(
    sepoliaPublicClient,
    {
      entryPoint,
      signer: sepoliaEmptySessionKeySigner,
      policies: [sudoPolicy],
      kernelVersion: KERNEL_V3_1,
    }
  );

  const optimismSepoliaPermissionPlugin = await toPermissionValidator(
    optimismSepoliaPublicClient,
    {
      entryPoint,
      signer: optimismSepoliaEmptySessionKeySigner,
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

  // serialize multi chain permission account with empty account signer, so get approvals
  const [sepoliaApproval, optimismSepoliaApproval] =
    await serializeMultiChainPermissionAccounts([
      {
        account: sepoliaKernelAccount,
      },
      {
        account: optimismSepoliaKernelAccount,
      },
    ]);

  // get real session key signers
  const sepoliaSessionKeySigner = await toECDSASigner({
    signer: sepoliaSessionKeyAccount,
  });

  const optimismSepoliaSessionKeySigner = await toECDSASigner({
    signer: optimismSepoliaSessionKeyAccount,
  });

  // deserialize the permission account with the real session key signers
  const deserializeSepoliaKernelAccount = await deserializePermissionAccount(
    sepoliaPublicClient,
    entryPoint,
    KERNEL_V3_1,
    sepoliaApproval,
    sepoliaSessionKeySigner
  );

  const deserializeOptimismSepoliaKernelAccount =
    await deserializePermissionAccount(
      optimismSepoliaPublicClient,
      entryPoint,
      KERNEL_V3_1,
      optimismSepoliaApproval,
      optimismSepoliaSessionKeySigner
    );

  const sepoliaZeroDevPaymasterClient = createZeroDevPaymasterClient({
    chain: sepolia,
    transport: http(SEPOLIA_ZERODEV_RPC_URL),
  });

  const opSepoliaZeroDevPaymasterClient = createZeroDevPaymasterClient({
    chain: optimismSepolia,
    transport: http(OPTIMISM_SEPOLIA_ZERODEV_RPC_URL),
  });

  // use createKernelMultiChainClient to support multi-chain operations instead of createKernelAccountClient
  const sepoliaZerodevKernelClient = createKernelAccountClient({
    // use the deserialized permission account
    account: deserializeSepoliaKernelAccount,
    chain: sepolia,
    bundlerTransport: http(SEPOLIA_ZERODEV_RPC_URL),
    paymaster: {
      getPaymasterData(userOperation) {
        return sepoliaZeroDevPaymasterClient.sponsorUserOperation({
          userOperation,
        });
      },
    },
  });

  const optimismSepoliaZerodevKernelClient = createKernelAccountClient({
    // use the deserialized permission account
    account: deserializeOptimismSepoliaKernelAccount,
    chain: optimismSepolia,
    bundlerTransport: http(OPTIMISM_SEPOLIA_ZERODEV_RPC_URL),
    paymaster: {
      getPaymasterData(userOperation) {
        return opSepoliaZeroDevPaymasterClient.sponsorUserOperation({
          userOperation,
        });
      },
    },
  });

  // send user ops. you don't need additional enables like `prepareAndSignUserOperations`, since it already has the approvals with serialized account
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
