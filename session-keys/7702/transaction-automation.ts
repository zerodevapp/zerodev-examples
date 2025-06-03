import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
  addressToEmptyAccount,
} from "@zerodev/sdk";
import { http, Hex, createPublicClient, Address, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import {
  ModularSigner,
  deserializePermissionAccount,
  serializePermissionAccount,
  toPermissionValidator,
} from "@zerodev/permissions";
import { getEntryPoint, KERNEL_V3_3 } from "@zerodev/sdk/constants";

if (
  !process.env.ZERODEV_RPC ||
  !process.env.PRIVATE_KEY
) {
  throw new Error("ZERODEV_RPC or PRIVATE_KEY is not set");
}

const chain = sepolia;
const ZERODEV_RPC = process.env.ZERODEV_RPC;

const publicClient = createPublicClient({
  transport: http(ZERODEV_RPC),
  chain,
});

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex);
const entryPoint = getEntryPoint("0.7");

const getApproval = async (sessionKeyAddress: Address) => {

  // Create an "empty account" as the signer -- you only need the public
  // key (address) to do this.
  const emptyAccount = addressToEmptyAccount(sessionKeyAddress);
  const emptySessionKeySigner = await toECDSASigner({ signer: emptyAccount });

  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint,
    signer: emptySessionKeySigner,
    policies: [
      // In this example, we are just using a sudo policy to allow everything.
      // In practice, you would want to set more restrictive policies.
      toSudoPolicy({}),
    ],
    kernelVersion: KERNEL_V3_3,
  });

  const sessionKeyAccount = await createKernelAccount(publicClient, {
    entryPoint,
    eip7702Account: signer,
    plugins: {
      regular: permissionPlugin,
    },
    kernelVersion: KERNEL_V3_3,
  });
  console.log("sessionKeyAccount", sessionKeyAccount.address)

  return await serializePermissionAccount(sessionKeyAccount);
};

const useSessionKey = async (
  approval: string,
  sessionKeySigner: ModularSigner
) => {
  const sessionKeyAccount = await deserializePermissionAccount(
    publicClient,
    entryPoint,
    KERNEL_V3_3,
    approval,
    sessionKeySigner
  );
  console.log("sessionKeyAccount", sessionKeyAccount.address)
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

  const _receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log({ txHash: _receipt.receipt.transactionHash });
};


const main = async () => {
  // The agent creates a public-private key pair and sends
  // the public key (address) to the owner.
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  // The owner approves the session key by signing its address and sending
  // back the signature
  const approval = await getApproval(sessionKeySigner.account.address);

  // The agent constructs a full session key
  await useSessionKey(approval, sessionKeySigner);

};

main();
