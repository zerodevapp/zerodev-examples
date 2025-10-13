import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
  KernelValidator,
  addressToEmptyAccount,
} from "@zerodev/sdk";
import {
  toPermissionValidator,
  deserializePermissionAccount,
  serializePermissionAccount,
} from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import { http, createPublicClient, type Address, zeroAddress, PrivateKeyAccount, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { getEntryPoint, KERNEL_V3_3 } from "@zerodev/sdk/constants";
import { createWeightedKernelAccountClient, createWeightedValidator, encodeSignatures, toECDSASigner as toWeightedECDSASigner, WeightedValidatorContractVersion } from "@zerodev/weighted-validator";

if (
  !process.env.ZERODEV_PROJECT_ID
) {
  throw new Error("ZERODEV_PROJECT_ID is not set");
}


const signer1 = privateKeyToAccount(generatePrivateKey());
const signer2 = privateKeyToAccount(generatePrivateKey());

const sessionPrivateKey = generatePrivateKey();
const sessionSigner = privateKeyToAccount(sessionPrivateKey);
const entryPoint = getEntryPoint("0.7");
const chain = sepolia;
const ZERODEV_RPC = `https://rpc.zerodev.app/api/v3/${process.env.ZERODEV_PROJECT_ID}/chain/${chain.id}`;
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
})

const getApproval = async (signer: PrivateKeyAccount, sessionKeyValidator: KernelValidator) => {
  const weightedSigner = await toWeightedECDSASigner({ signer: signer });
  const multisigValidator = await createWeightedValidator(publicClient, {
    entryPoint,
    config: {
      threshold: 100,
      signers: [
        { publicKey: signer1.address as Address, weight: 50 },
        { publicKey: signer2.address as Address, weight: 50 },
      ],
    },
    signer: weightedSigner,
    kernelVersion: KERNEL_V3_3,
    validatorContractVersion: WeightedValidatorContractVersion.V0_0_2_PATCHED,
  });


  const masterAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: multisigValidator,
    },
    kernelVersion: KERNEL_V3_3,
  });
  console.log("Account address:", masterAccount.address);
  const kernelPaymaster = createZeroDevPaymasterClient({
    chain: sepolia,
    transport: http(ZERODEV_RPC),
  });
  const weightedKernelAccountClient = createWeightedKernelAccountClient({
    account: masterAccount,
    chain: sepolia,
    bundlerTransport: http(ZERODEV_RPC),
    paymaster: {
      getPaymasterData(userOperation) {
        return kernelPaymaster.sponsorUserOperation({ userOperation });
      },
    },
  })
  return await weightedKernelAccountClient.approvePlugin({
    plugin: sessionKeyValidator,
    validatorContractVersion: WeightedValidatorContractVersion.V0_0_2_PATCHED,
  });
}

const createSessionKey = async () => {

  // Note you don't need the actual signer here, only the address
  // Can use actual signer too if you have it available
  const signer1EmptyAccount = addressToEmptyAccount(signer1.address)
  const signer1Weighted = await toWeightedECDSASigner({ signer: signer1EmptyAccount });
  const multisigValidator = await createWeightedValidator(publicClient, {
    entryPoint,
    config: {
      threshold: 100,
      signers: [
        { publicKey: signer1.address as Address, weight: 50 },
        { publicKey: signer2.address as Address, weight: 50 },
      ],
    },
    signer: signer1Weighted,
    kernelVersion: KERNEL_V3_3,
    validatorContractVersion: WeightedValidatorContractVersion.V0_0_2_PATCHED,
  });


  const sessionKeyEmptyAccount = addressToEmptyAccount(sessionSigner.address);
  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyEmptyAccount
  });

  const sessionKeyValidator = await toPermissionValidator(publicClient, {
    entryPoint,
    signer: sessionKeySigner,
    policies: [
      toSudoPolicy({}),
    ],
    kernelVersion: KERNEL_V3_3,
  });
  const approval1 = await getApproval(signer1, sessionKeyValidator);
  console.log("approval1", approval1);
  const approval2 = await getApproval(signer2, sessionKeyValidator);
  console.log("approval2", approval2);
  let enableSignature;
  if (approval1 && approval2) {
    enableSignature = encodeSignatures([approval1, approval2], true);
  }

  const sessionKeyAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: multisigValidator,
      regular: sessionKeyValidator,
    },
    kernelVersion: KERNEL_V3_3,
  });

  // Serialize the session key account with its private key
  return await serializePermissionAccount(sessionKeyAccount, sessionPrivateKey, enableSignature);
};

const useSessionKey = async (serializedSessionKey: string) => {
  // Deserialize the session key account
  const sessionKeyAccount = await deserializePermissionAccount(
    publicClient,
    entryPoint,
    KERNEL_V3_3,
    serializedSessionKey
  );
  console.log("sessionKeyAccount", sessionKeyAccount.address);

  const kernelPaymaster = createZeroDevPaymasterClient({
    chain: sepolia,
    transport: http(ZERODEV_RPC),
  });

  const kernelClient = createKernelAccountClient({
    account: sessionKeyAccount,
    chain: sepolia,
    bundlerTransport: http(ZERODEV_RPC),
    paymaster: {
      getPaymasterData(userOperation) {
        return kernelPaymaster.sponsorUserOperation({ userOperation });
      },
    },
  });

  const userOpHash = await kernelClient.sendUserOperation({
    callData: await sessionKeyAccount.encodeCalls([
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  });

  console.log("UserOp hash:", userOpHash);

  const { receipt } = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log("UserOp completed!", `${chain.blockExplorers.default.url}/tx/${receipt.transactionHash}`);
};

const main = async () => {
  // The owner creates a session key and shares the serialized data with the agent
  const serializedSessionKey = await createSessionKey();

  // The agent uses the serialized session key data to perform operations
  await useSessionKey(serializedSessionKey);
  process.exit(0);
};

main();
