import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk";
import {
  http,
  Hex,
  createPublicClient,
  zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { toECDSASigner } from "@zerodev/permissions/signers";
import {
  ModularSigner,
  deserializePermissionAccount,
  serializePermissionAccount,
  toPermissionValidator,
} from "@zerodev/permissions";
import {
  toSudoPolicy,
} from "@zerodev/permissions/policies";
import { getEntryPoint, KERNEL_V3_3 } from "@zerodev/sdk/constants";

if (
  !process.env.ZERODEV_RPC
) {
  throw new Error("ZERODEV_RPC is not set");
}

const chain = sepolia;
const ZERODEV_RPC = process.env.ZERODEV_RPC;
const publicClient = createPublicClient({
  chain,
  transport: http(ZERODEV_RPC),
});

const privateKey = process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY as Hex : generatePrivateKey();
const signer = privateKeyToAccount(privateKey);

const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_3;


const createSessionKey = async (
  sessionKeySigner: ModularSigner,
  sessionPrivateKey: Hex
) => {

  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint,
    signer: sessionKeySigner,
    policies: [
      // In this example, we are just using a sudo policy to allow everything.
      // In practice, you would want to set more restrictive policies.
      toSudoPolicy({}),
    ],
    kernelVersion,
  });

  const sessionKeyAccount = await createKernelAccount(publicClient, {
    entryPoint,
    eip7702Account: signer,
    plugins: {
      regular: permissionPlugin,
    },
    kernelVersion,
    address: signer.address,
  });

  // Include the private key when you serialize the session key
  return await serializePermissionAccount(sessionKeyAccount, sessionPrivateKey);
};

const useSessionKey = async (serializedSessionKey: string) => {
  const sessionKeyAccount = await deserializePermissionAccount(
    publicClient,
    entryPoint,
    KERNEL_V3_3,
    serializedSessionKey
  );
  console.log("Session key account address:", sessionKeyAccount.address);

  const kernelPaymaster = createZeroDevPaymasterClient({
    chain,
    transport: http(ZERODEV_RPC),
  });
  const kernelClient = createKernelAccountClient({
    account: sessionKeyAccount,
    chain,
    bundlerTransport: http(ZERODEV_RPC),
    paymaster: kernelPaymaster,
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
  console.log("userOp hash:", userOpHash);

  const { receipt } = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log(
    "UserOp completed",
    `${chain.blockExplorers.default.url}/tx/${receipt.transactionHash}`
  );
};

const main = async () => {
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  // The owner creates a session key, serializes it, and shares it with the agent.
  const serializedSessionKey = await createSessionKey(
    sessionKeySigner,
    sessionPrivateKey
  );

  // The agent reconstructs the session key using the serialized value
  await useSessionKey(serializedSessionKey);
};

main().then(() => {
  console.log("Done");
  process.exit(0);
});
