import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  signerToSessionKeyValidator,
  ParamOperator,
  serializeSessionKeyAccount,
  deserializeSessionKeyAccount,
  oneAddress,
} from "@zerodev/session-key";
import {
  http,
  Hex,
  createPublicClient,
  parseAbi,
  encodeFunctionData,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { getEntryPoint, KERNEL_V2_4 } from "@zerodev/sdk/constants";

if (
  !process.env.ZERODEV_RPC ||
  !process.env.PRIVATE_KEY
) {
  throw new Error("ZERODEV_RPC or PRIVATE_KEY is not set");
}

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.ZERODEV_RPC),
});

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex);
const contractAddress = "0x34bE7f35132E97915633BC1fc020364EA5134863";
const contractABI = parseAbi([
  "function mint(address _to) public",
  "function balanceOf(address owner) external view returns (uint256 balance)",
]);
const sessionPrivateKey = generatePrivateKey();
const sessionKeySigner = privateKeyToAccount(sessionPrivateKey);

const entryPoint = getEntryPoint("0.6");
const createSessionKey = async () => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    entryPoint,
    signer,
    kernelVersion: KERNEL_V2_4,
  });

  const masterAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
    },
    kernelVersion: KERNEL_V2_4,
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
    kernelVersion: KERNEL_V2_4,
  });

  const sessionKeyAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
      regular: sessionKeyValidator,
    },
    kernelVersion: KERNEL_V2_4,
  });

  // Include the private key when you serialize the session key
  return await serializeSessionKeyAccount(sessionKeyAccount, sessionPrivateKey);
};

const useSessionKey = async (serializedSessionKey: string) => {
  const sessionKeyAccount = await deserializeSessionKeyAccount(
    publicClient,
    entryPoint,
    KERNEL_V2_4,
    serializedSessionKey
  );

  const kernelPaymaster = createZeroDevPaymasterClient({
    chain: sepolia,
    transport: http(process.env.ZERODEV_RPC),
  });
  const kernelClient = createKernelAccountClient({
    account: sessionKeyAccount,
    chain: sepolia,
    bundlerTransport: http(process.env.ZERODEV_RPC),
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

  console.log("userOp hash:", userOpHash);
};

const main = async () => {
  // The owner creates a session key, serializes it, and shares it with the agent.
  const serializedSessionKey = await createSessionKey();

  // The agent reconstructs the session key using the serialized value
  await useSessionKey(serializedSessionKey);
};

main();
