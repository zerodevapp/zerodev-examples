import "dotenv/config"
import { createPublicClient, encodeFunctionData, http, parseAbi } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk"

if (!process.env.ZERODEV_PROJECT_ID) {
  throw new Error("ZERODEV_PROJECT_ID is not set");
}

const BUNDLER_RPC = `https://rpc.zerodev.app/api/v2/bundler/${process.env.ZERODEV_PROJECT_ID}`;
const PAYMASTER_RPC = `https://rpc.zerodev.app/api/v2/paymaster/${process.env.ZERODEV_PROJECT_ID}`;

// The NFT contract we will be interacting with
const contractAddress = "0x34bE7f35132E97915633BC1fc020364EA5134863";
const contractABI = parseAbi([
  "function mint(address _to) public",
  "function balanceOf(address owner) external view returns (uint256 balance)",
]);

// Construct a public client
const publicClient = createPublicClient({
  transport: http(BUNDLER_RPC),
});
const entryPoint = ENTRYPOINT_ADDRESS_V07;

const chain = sepolia

const main = async () => {
  // Construct a signer
  const privateKey = generatePrivateKey();
  const signer = privateKeyToAccount(privateKey);

  // Construct a validator
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
  })

  // Construct a Kernel account
  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
    },
  })

  // Construct a Kernel account client
  const kernelClient = createKernelAccountClient({
    account,
    chain,
    entryPoint,
    bundlerTransport: http(BUNDLER_RPC),
    middleware: {
      sponsorUserOperation: async ({ userOperation }) => {
        const zerodevPaymaster = createZeroDevPaymasterClient({
          chain,
          entryPoint,
          transport: http(PAYMASTER_RPC),
        })
        return zerodevPaymaster.sponsorUserOperation({
          userOperation,
          entryPoint,
        })
      }
    }
  })

  const accountAddress = kernelClient.account.address;
  console.log("My account:", accountAddress);

  // Send a UserOp
  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await kernelClient.account.encodeCallData({
        to: contractAddress,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: contractABI,
          functionName: "mint",
          args: [accountAddress],
        }),
      }),
    },
  });
  console.log("Submitted UserOp:", userOpHash);

  // Wait for the UserOp to be included on-chain
  const bundlerClient = kernelClient.extend(bundlerActions(entryPoint))

  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log("UserOp confirmed:", receipt.userOpHash);

  // Print NFT balance
  const nftBalance = await publicClient.readContract({
    address: contractAddress,
    abi: contractABI,
    functionName: "balanceOf",
    args: [accountAddress],
  });
  console.log(`NFT balance: ${nftBalance}`);
};

main();
