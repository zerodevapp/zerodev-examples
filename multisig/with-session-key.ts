import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk";
import { createWeightedECDSAValidator } from "@zerodev/weighted-ecdsa-validator";
import {
  signerToSessionKeyValidator,
  ParamOperator,
  serializeSessionKeyAccount,
  deserializeSessionKeyAccount,
  oneAddress,
} from "@zerodev/session-key";
import {
  ENTRYPOINT_ADDRESS_V06,
  ENTRYPOINT_ADDRESS_V07,
  UserOperation,
  bundlerActions,
} from "permissionless";
import { http, createPublicClient, parseAbi, encodeFunctionData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

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

const contractAddress = "0x34bE7f35132E97915633BC1fc020364EA5134863";
const contractABI = parseAbi([
  "function mint(address _to) public",
  "function balanceOf(address owner) external view returns (uint256 balance)",
]);
const sessionPrivateKey = generatePrivateKey();
const sessionKeySigner = privateKeyToAccount(sessionPrivateKey);
const entryPoint = ENTRYPOINT_ADDRESS_V06;

const createSessionKey = async () => {
  const multisigValidator = await createWeightedECDSAValidator(publicClient, {
    entryPoint,
    config: {
      threshold: 100,
      signers: [
        { address: signer1.address, weight: 100 },
        { address: signer2.address, weight: 50 },
        { address: signer3.address, weight: 50 },
      ],
    },
    signers: [signer2, signer3],
  });

  const masterAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: multisigValidator,
    },
  });
  console.log("Account address:", masterAccount.address);

  const sessionKeyValidator = await signerToSessionKeyValidator(publicClient, {
    entryPoint,
    signer: sessionKeySigner,
    validatorData: {
      paymaster: oneAddress,
      permissions: [
        {
          target: contractAddress,
          // Maximum value that can be transferred.  In this case we
          // set it to zero so that no value transfer is possible.
          valueLimit: BigInt(0),
          // Contract abi
          abi: contractABI,
          // Function name
          functionName: "mint",
          // An array of conditions, each corresponding to an argument for
          // the function.
          args: [
            {
              // In this case, we are saying that the session key can only mint
              // NFTs to the account itself
              operator: ParamOperator.EQUAL,
              value: masterAccount.address,
            },
          ],
        },
      ],
    },
  });

  const sessionKeyAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: multisigValidator,
      regular: sessionKeyValidator,
    },
  });

  // Include the private key when you serialize the session key
  return await serializeSessionKeyAccount(sessionKeyAccount, sessionPrivateKey);
};

const useSessionKey = async (serializedSessionKey: string) => {
  const sessionKeyAccount = await deserializeSessionKeyAccount(
    publicClient,
    entryPoint,
    serializedSessionKey
  );

  const kernelPaymaster = createZeroDevPaymasterClient({
    entryPoint,
    chain: sepolia,
    transport: http(process.env.PAYMASTER_RPC),
  });
  const kernelClient = createKernelAccountClient({
    entryPoint,
    account: sessionKeyAccount,
    chain: sepolia,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    middleware: { sponsorUserOperation: kernelPaymaster.sponsorUserOperation },
  });

  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await sessionKeyAccount.encodeCallData({
        to: contractAddress,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: contractABI,
          functionName: "mint",
          args: [sessionKeyAccount.address],
        }),
      }),
    },
  });

  console.log("UserOp hash:", userOpHash);

  const bundlerClient = kernelClient.extend(
    bundlerActions(ENTRYPOINT_ADDRESS_V07)
  );
  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log("UserOp completed!");
};

const main = async () => {
  // The owner creates a session key, serializes it, and shares it with the agent.
  const serializedSessionKey = await createSessionKey();

  // The agent reconstructs the session key using the serialized value
  await useSessionKey(serializedSessionKey);
};

main();
