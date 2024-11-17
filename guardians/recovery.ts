import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk";
import {
  http,
  createPublicClient,
  Hex,
  toFunctionSelector,
  parseAbi,
  encodeFunctionData,
  zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  createWeightedECDSAValidator,
  getRecoveryAction,
} from "@zerodev/weighted-ecdsa-validator";
import {
  getValidatorAddress,
  signerToEcdsaValidator,
} from "@zerodev/ecdsa-validator";
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

const oldSigner = privateKeyToAccount(generatePrivateKey());
const newSigner = privateKeyToAccount(process.env.PRIVATE_KEY as Hex);
const guardian = privateKeyToAccount(generatePrivateKey());

const entryPoint = getEntryPoint("0.7");
const recoveryExecutorFunction =
  "function doRecovery(address _validator, bytes calldata _data)";
const main = async () => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: oldSigner,
    entryPoint,
    kernelVersion: KERNEL_V3_1,
  });

  const guardianValidator = await createWeightedECDSAValidator(publicClient, {
    entryPoint,
    config: {
      threshold: 100,
      signers: [{ address: guardian.address, weight: 100 }],
    },
    signers: [guardian],
    kernelVersion: KERNEL_V3_1,
  });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
      regular: guardianValidator,
      action: getRecoveryAction(entryPoint.version),
    },
    kernelVersion: KERNEL_V3_1,
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain: sepolia,
    transport: http(process.env.PAYMASTER_RPC),
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain: sepolia,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    paymaster: {
      getPaymasterData(userOperation) {
        return paymasterClient.sponsorUserOperation({ userOperation });
      },
    },
  });

  console.log("performing recovery...");
  const userOpHash = await kernelClient.sendUserOperation({
    callData: encodeFunctionData({
      abi: parseAbi([recoveryExecutorFunction]),
      functionName: "doRecovery",
      args: [getValidatorAddress(entryPoint, KERNEL_V3_1), newSigner.address],
    }),
  });

  console.log("recovery userOp hash:", userOpHash);

  await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log("recovery completed!");

  const newEcdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: newSigner,
    entryPoint,
    kernelVersion: KERNEL_V3_1,
  });

  const newAccount = await createKernelAccount(publicClient, {
    address: account.address,
    entryPoint,
    plugins: {
      sudo: newEcdsaValidator,
    },
    kernelVersion: KERNEL_V3_1,
  });

  const newKernelClient = createKernelAccountClient({
    account: newAccount,
    chain: sepolia,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    paymaster: paymasterClient,
  });

  console.log("sending userOp with new signer");
  const userOpHash2 = await newKernelClient.sendUserOperation({
    callData: await newAccount.encodeCalls([
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  });
  console.log("userOp hash:", userOpHash2);

  await newKernelClient.waitForUserOperationReceipt({
    hash: userOpHash2,
  });
  console.log("userOp completed!");
};

main();
