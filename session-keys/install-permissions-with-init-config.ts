import "dotenv/config";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { deserializePermissionAccount, ModularSigner, serializePermissionAccount, toInitConfig, toPermissionValidator } from "@zerodev/permissions";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import { toECDSASigner } from "@zerodev/permissions/signers";
import {
  addressToEmptyAccount,
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_3 } from "@zerodev/sdk/constants";
import { Address, createPublicClient, zeroAddress } from "viem";
import { http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const chain = sepolia;
const ZERODEV_RPC = `${process.env.ZERODEV_RPC}/${chain.id}`;
const publicClient = createPublicClient({
  chain,
  transport: http(ZERODEV_RPC),
});

const signer = privateKeyToAccount(generatePrivateKey());
const kernelVersion = KERNEL_V3_3;

const entryPoint = getEntryPoint("0.7");

const createSessionKey = async (sessionKeyAddress: Address) => {
  // Notice you don't need the actual owner signer here, only the address
  const ownerSigner = addressToEmptyAccount(signer.address);
  
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    entryPoint,
    signer: ownerSigner,
    kernelVersion,
  });

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
    kernelVersion,
  });

  const sessionKeyAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
    },
    kernelVersion,
    initConfig: await toInitConfig(permissionPlugin),
  });

  return await serializePermissionAccount(sessionKeyAccount, undefined, undefined, undefined, permissionPlugin);
};

const useSessionKey = async (
  approval: string,
  sessionKeySigner: ModularSigner
) => {
  const sessionKeyAccount = await deserializePermissionAccount(
    publicClient,
    entryPoint,
    kernelVersion,
    approval,
    sessionKeySigner
  );

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

  console.log("userOp hash:", userOpHash);

  const _receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log({ txExplorerUrl: `${chain.blockExplorers.default.url}/tx/${_receipt.receipt.transactionHash}` });
};
const main = async () => {
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  const serializedSessionKey = await createSessionKey(sessionKeySigner.account.address);

  await useSessionKey(serializedSessionKey, sessionKeySigner);

  process.exit(0);
};

main();
