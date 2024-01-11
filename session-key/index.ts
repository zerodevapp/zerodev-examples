import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@kerneljs/core";
import { signerToEcdsaValidator } from "@kerneljs/ecdsa-validator";
import {
  signerToSessionKeyValidator,
  ParamOperator,
} from "@kerneljs/session-key";
import { UserOperation } from "permissionless";
import {
  http,
  Hex,
  createPublicClient,
  zeroAddress,
  parseAbi,
  encodeFunctionData,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { polygonMumbai } from "viem/chains";

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

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex);
const sessionPrivateKey = generatePrivateKey();
const contractAddress = "0x34bE7f35132E97915633BC1fc020364EA5134863";
const contractABI = parseAbi([
  "function mint(address _to) public",
  "function balanceOf(address owner) external view returns (uint256 balance)",
]);

const main = async () => {
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
  });

  const sessionKeyPlugin = await signerToSessionKeyValidator(publicClient, {
    signer: sessionKeyAccount,
    validatorData: {
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
              // In this case, we are saying that the address must be equal
              // to the given value.
              operator: ParamOperator.EQUAL,
              value: signer.address,
            },
          ],
        },
      ],
    },
  });

  const account = await createKernelAccount(publicClient, {
    defaultValidator: ecdsaValidator,
    plugin: sessionKeyPlugin,
    index: BigInt(1921313)
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain: polygonMumbai,
    transport: http(process.env.BUNDLER_RPC),
    sponsorUserOperation: async ({ userOperation }): Promise<UserOperation> => {
      const kernelPaymaster = createZeroDevPaymasterClient({
        chain: polygonMumbai,
        transport: http(process.env.PAYMASTER_RPC),
      });
      return kernelPaymaster.sponsorUserOperation({
        userOperation,
      });
    },
  });

  console.log("My account:", kernelClient.account.address);

  const txnHash = await kernelClient.sendTransaction({
    to: contractAddress,
    value: BigInt(0),
    data: encodeFunctionData({
      abi: contractABI,
      functionName: "mint",
      args: [signer.address],
    }),
  });

  console.log("txn hash:", txnHash);

  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await account.encodeCallData({
        to: contractAddress,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: contractABI,
          functionName: "mint",
          args: [signer.address],
        }),
      }),
    },
  });

  console.log("userOp hash:", userOpHash);
};

main();
