import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk";
import { createWeightedValidator } from "@zerodev/weighted-validator";
import { toECDSASigner as toWeightedECDSASigner } from "@zerodev/weighted-validator/signers";
import {
  ModularSigner,
  toPermissionValidator,
} from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toCallPolicy, CallPolicyVersion } from "@zerodev/permissions/policies";
import { http, createPublicClient, parseAbi, encodeFunctionData, zeroAddress, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";

if (
  !process.env.BUNDLER_RPC ||
  !process.env.PAYMASTER_RPC ||
  !process.env.PRIVATE_KEY
) {
  throw new Error("BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY is not set");
}

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.BUNDLER_RPC),
});

const signer1 = privateKeyToAccount(generatePrivateKey());
const signer2 = privateKeyToAccount(generatePrivateKey());
const signer3 = privateKeyToAccount(generatePrivateKey());

const contractAddress = "0x34bE7f35132E97915633BC1fc020364EA5134863" as Address;
const contractABI = parseAbi([
  "function mint(address _to) public",
  "function balanceOf(address owner) external view returns (uint256 balance)",
]);
const sessionPrivateKey = generatePrivateKey();
const sessionKeySigner = privateKeyToAccount(sessionPrivateKey);
const entryPoint = getEntryPoint("0.7");

const createSessionKey = async () => {
  const ecdsaSigner2 = await toWeightedECDSASigner({ signer: signer2 });
  const ecdsaSigner3 = await toWeightedECDSASigner({ signer: signer3 });

  const multisigValidator = await createWeightedValidator(publicClient, {
    entryPoint,
    config: {
      threshold: 100,
      signers: [
        { publicKey: signer1.address as Address, weight: 100 },
        { publicKey: signer2.address as Address, weight: 50 },
        { publicKey: signer3.address as Address, weight: 50 },
      ],
    },
    signer: ecdsaSigner2,
    kernelVersion: KERNEL_V3_1,
  });

  const masterAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: multisigValidator,
    },
    kernelVersion: KERNEL_V3_1,
  });
  console.log("Account address:", masterAccount.address);

  const sessionKeySigner = await toECDSASigner({
    signer: privateKeyToAccount(sessionPrivateKey)
  });

  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_4,
    permissions: [
      {
        target: contractAddress,
        valueLimit: BigInt(0),
        abi: contractABI,
        functionName: "mint",
      },
    ],
  });

  const sessionKeyValidator = await toPermissionValidator(publicClient, {
    entryPoint,
    signer: sessionKeySigner,
    policies: [callPolicy],
    kernelVersion: KERNEL_V3_1,
  });

  const sessionKeyAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: multisigValidator,
      regular: sessionKeyValidator,
    },
    kernelVersion: KERNEL_V3_1,
  });

  return {
    accountAddress: sessionKeyAccount.address,
    privateKey: sessionPrivateKey,
  };
};

const useSessionKey = async (sessionKeyData: { accountAddress: string, privateKey: string }) => {
  const sessionKeySigner = await toECDSASigner({
    signer: privateKeyToAccount(sessionKeyData.privateKey as Address)
  });

  const sessionKeyValidator = await toPermissionValidator(publicClient, {
    entryPoint,
    signer: sessionKeySigner,
    policies: [
      toCallPolicy({
        policyVersion: CallPolicyVersion.V0_0_4,
        permissions: [
          {
            target: contractAddress,
            valueLimit: BigInt(0),
            abi: contractABI,
            functionName: "mint",
            args: [sessionKeyData.accountAddress as Address],
          },
        ],
      }),
    ],
    kernelVersion: KERNEL_V3_1,
  });

  const sessionKeyAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      regular: sessionKeyValidator,
    },
    kernelVersion: KERNEL_V3_1,
  });

  const kernelPaymaster = createZeroDevPaymasterClient({
    chain: sepolia,
    transport: http(process.env.PAYMASTER_RPC),
  });

  const kernelClient = createKernelAccountClient({
    account: sessionKeyAccount,
    chain: sepolia,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    paymaster: {
      getPaymasterData(userOperation) {
        return kernelPaymaster.sponsorUserOperation({ userOperation });
      },
    },
  });

  const userOpHash = await kernelClient.sendUserOperation({
    callData: await sessionKeyAccount.encodeCalls([
      {
        to: contractAddress,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: contractABI,
          functionName: "mint",
          args: [sessionKeyAccount.address],
        }),
      },
    ]),
  });

  console.log("UserOp hash:", userOpHash);

  await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log("UserOp completed!");
};

const main = async () => {
  // The owner creates a session key and shares the data with the agent
  const sessionKeyData = await createSessionKey();

  // The agent uses the session key data to perform operations
  await useSessionKey(sessionKeyData);
};

main();
