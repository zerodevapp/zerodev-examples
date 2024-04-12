import "dotenv/config";
import { createEcdsaKernelAccountClient } from "@zerodev/presets/zerodev";
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
  ENTRYPOINT_ADDRESS_V06,
  UserOperation,
  bundlerActions,
} from "permissionless";
import {
  getKernelV1Account,
  getKernelV1AccountClient,
  getZeroDevERC20PaymasterClient,
} from "../../utils";
import { EntryPoint } from "permissionless/types/entrypoint";

const TEST_ERC20_ABI = parseAbi([
  "function mint(address to, uint256 amount) external",
]);

const entryPoint = ENTRYPOINT_ADDRESS_V06;

const main = async () => {
  const kernelAccount = await getKernelV1Account();
  const kernelClient = await getKernelV1AccountClient({
    account: kernelAccount,
    middleware: {
      sponsorUserOperation: async ({ entryPoint, userOperation }) => {
        const zerodevPaymaster = getZeroDevERC20PaymasterClient(entryPoint);
        return zerodevPaymaster.sponsorUserOperation({
          entryPoint,
          userOperation,
          gasToken: gasTokenAddresses[sepolia.id]["6TEST"],
        });
      },
    },
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
    userOperation: {
      callData: await kernelClient.account.encodeCallData([
        {
          to: gasTokenAddresses[sepolia.id]["6TEST"],
          data: encodeFunctionData({
            abi: TEST_ERC20_ABI,
            functionName: "mint",
            args: [kernelClient.account.address, parseEther("0.9")],
          }),
          value: BigInt(0),
        },
        await getERC20PaymasterApproveCall(
          paymasterClient as ZeroDevPaymasterClient<EntryPoint>,
          {
            gasToken: gasTokenAddresses[sepolia.id]["6TEST"],
            approveAmount: parseEther("0.9"),
          }
        ),
        {
          to: zeroAddress,
          value: BigInt(0),
          data: "0x",
        },
      ]),
    },
  });

  console.log("userOp hash:", userOpHash);

  const bundlerClient = kernelClient.extend(bundlerActions(entryPoint));
  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log("UserOp completed");
};

main();
