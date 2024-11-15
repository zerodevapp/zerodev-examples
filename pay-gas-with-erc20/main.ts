import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
  getERC20PaymasterApproveCall,
  gasTokenAddresses,
} from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  http,
  Hex,
  createPublicClient,
  zeroAddress,
  encodeFunctionData,
  parseAbi,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";

if (
  !process.env.BUNDLER_RPC ||
  !process.env.PAYMASTER_RPC ||
  !process.env.PRIVATE_KEY
) {
  throw new Error("BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY is not set");
}
const chain = sepolia;
const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
  chain,
});

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex);

const TEST_ERC20_ABI = parseAbi([
  "function mint(address to, uint256 amount) external",
]);
const entryPoint = getEntryPoint("0.7");

const main = async () => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    entryPoint,
    signer,
    kernelVersion: KERNEL_V3_1,
  });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
    },
    kernelVersion: KERNEL_V3_1,
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    entryPoint,
    transport: http(process.env.PAYMASTER_RPC),
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    paymaster: paymasterClient,
    paymasterContext: {
      token: gasTokenAddresses[sepolia.id]["USDC"],
    },
  });

  console.log("My account:", account.address);

  // In this example, just for convenience, we mint and approve the test
  // tokens within the same batch, but you don't have to do that.
  //
  // You just need to make sure that the account has enough ERC20 tokens
  // and that it has approved the paymaster with enough tokens to pay for
  // the gas.

  // You can get testnet USDC from https://faucet.circle.com/
  const userOpHash = await kernelClient.sendUserOperation({
    callData: await account.encodeCalls([
      await getERC20PaymasterApproveCall(paymasterClient, {
        gasToken: gasTokenAddresses[sepolia.id]["USDC"],
        approveAmount: parseEther("1"),
        entryPoint,
      }),

      await getERC20PaymasterApproveCall(paymasterClient, {
        gasToken: gasTokenAddresses[chain.id]["6TEST"],
        approveAmount: parseEther("1"),
        entryPoint,
      }),
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  });

  console.log("UserOp hash:", userOpHash);

  const receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log("UserOp completed", receipt.receipt.transactionHash);
};

main();
