import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk";
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless";
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
  ECDSA_VALIDATOR_ADDRESS_V07,
  signerToEcdsaValidator,
} from "@zerodev/ecdsa-validator";

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

const oldSigner = privateKeyToAccount(generatePrivateKey());
const newSigner = privateKeyToAccount(process.env.PRIVATE_KEY as Hex);
const guardian = privateKeyToAccount(generatePrivateKey());

const entryPoint = ENTRYPOINT_ADDRESS_V07;
const recoveryExecutorFunction =
  "function doRecovery(address _validator, bytes calldata _data)";
const main = async () => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: oldSigner,
    entryPoint,
  });

  const guardianValidator = await createWeightedECDSAValidator(publicClient, {
    entryPoint,
    config: {
      threshold: 100,
      signers: [{ address: guardian.address, weight: 100 }],
    },
    signers: [guardian],
  });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
      regular: guardianValidator,
      action: getRecoveryAction(entryPoint),
    },
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain: sepolia,
    transport: http(process.env.PAYMASTER_RPC),
    entryPoint,
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain: sepolia,
    entryPoint,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    middleware: {
      sponsorUserOperation: paymasterClient.sponsorUserOperation,
    },
  });

  console.log("performing recovery...");
  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: encodeFunctionData({
        abi: parseAbi([recoveryExecutorFunction]),
        functionName: "doRecovery",
        args: [ECDSA_VALIDATOR_ADDRESS_V07, newSigner.address],
      }),
    },
  });

  console.log("recovery userOp hash:", userOpHash);

  const bundlerClient = kernelClient.extend(bundlerActions(entryPoint));
  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log("recovery completed!");

  const newEcdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: newSigner,
    entryPoint,
  });

  const newAccount = await createKernelAccount(publicClient, {
    deployedAccountAddress: account.address,
    entryPoint,
    plugins: {
      sudo: newEcdsaValidator,
    },
  });

  const newKernelClient = createKernelAccountClient({
    entryPoint,
    account: newAccount,
    chain: sepolia,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    middleware: {
      sponsorUserOperation: paymasterClient.sponsorUserOperation,
    },
  });

  console.log("sending userOp with new signer");
  const userOpHash2 = await newKernelClient.sendUserOperation({
    userOperation: {
      callData: await newAccount.encodeCallData({
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      }),
    },
  });
  console.log("userOp hash:", userOpHash2);

  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash2,
  });
  console.log("userOp completed!");
};

main();
