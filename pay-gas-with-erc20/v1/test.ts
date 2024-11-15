import "dotenv/config";
import {
  Hex,
  encodeFunctionData,
  http,
  parseAbi,
  parseEther,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  ZeroDevPaymasterClient,
  createZeroDevPaymasterClient,
  gasTokenAddresses,
  getERC20PaymasterApproveCall,
} from "@zerodev/sdk";
import {
  getKernelV1Account,
  getKernelV1AccountClient,
  getZeroDevERC20PaymasterClient,
} from "../../utils";
import { getEntryPoint } from "@zerodev/sdk/constants";

const TEST_ERC20_ABI = parseAbi([
  "function mint(address to, uint256 amount) external",
]);

const entryPoint = getEntryPoint("0.6");

const main = async () => {
  const kernelAccount = await getKernelV1Account();
  const zerodevPaymaster = getZeroDevERC20PaymasterClient();
  const kernelClient = await getKernelV1AccountClient({
    account: kernelAccount,
    paymaster: zerodevPaymaster,
  });

  const paymasterClient = createZeroDevPaymasterClient({
    entryPoint,
    chain: sepolia,
    transport: http(
      `https://rpc.zerodev.app/api/v2/paymaster/${process.env.ZERODEV_PROJECT_ID}`
    ),
  });

  console.log("My account:", kernelClient.account.address);

  // In this example, just for convenience, we mint and approve the test
  // tokens within the same batch, but you don't have to do that.
  //
  // You just need to make sure that the account has enough ERC20 tokens
  // and that it has approved the paymaster with enough tokens to pay for
  // the gas.
  const userOpHash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls([
      {
        to: gasTokenAddresses[sepolia.id]["6TEST"],
        data: encodeFunctionData({
          abi: TEST_ERC20_ABI,
          functionName: "mint",
          args: [kernelClient.account.address, parseEther("0.9")],
        }),
        value: BigInt(0),
      },
      await getERC20PaymasterApproveCall(paymasterClient, {
        gasToken: gasTokenAddresses[sepolia.id]["6TEST"],
        approveAmount: parseEther("0.9"),
        entryPoint,
      }),
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  });

  console.log("userOp hash:", userOpHash);

  await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log("UserOp completed");
};

main();
