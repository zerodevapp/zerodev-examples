import "dotenv/config"
import { createEcdsaKernelAccountClient } from "@zerodev/presets/zerodev"
import { Hex, encodeFunctionData, http, parseAbi, parseEther, zeroAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { polygonMumbai } from "viem/chains"
import { createZeroDevPaymasterClient, gasTokenAddresses, getERC20PaymasterApproveCall } from "@zerodev/sdk"
import { bundlerActions } from "permissionless"

const zeroDevProjectId = process.env.ZERODEV_PROJECT_ID
const privateKey = process.env.PRIVATE_KEY
if (!zeroDevProjectId || !privateKey) {
  throw new Error("ZERODEV_PROJECT_ID or PRIVATE_KEY is not set")
}

const signer = privateKeyToAccount(privateKey as Hex)

const TEST_ERC20_ABI = parseAbi([
  "function mint(address to, uint256 amount) external",
])

const main = async () => {
  const kernelClient = await createEcdsaKernelAccountClient({
    chain: polygonMumbai,
    projectId: zeroDevProjectId,
    signer,
    paymaster: gasTokenAddresses[polygonMumbai.id]['6TEST'],
  })

  // If you need to approve the paymaster with your tokens, create a paymaster
  // client too.
  const paymasterClient = createZeroDevPaymasterClient({
    chain: polygonMumbai,
    transport: http(`https://rpc.zerodev.app/api/v2/paymaster/${zeroDevProjectId}`),
  })

  console.log("My account:", kernelClient.account.address)

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
          to: gasTokenAddresses[polygonMumbai.id]["6TEST"],
          data: encodeFunctionData({
            abi: TEST_ERC20_ABI,
            functionName: "mint",
            args: [kernelClient.account.address, BigInt(100000)]
          }),
          value: BigInt(0)
        },
        await getERC20PaymasterApproveCall(paymasterClient, {
          gasToken: gasTokenAddresses[polygonMumbai.id]["6TEST"],
          approveAmount: parseEther('1'),
        }),
        {
          to: zeroAddress,
          value: BigInt(0),
          data: "0x",
        },
      ]),
    },
  })

  console.log("userOp hash:", userOpHash)

  const bundlerClient = kernelClient.extend(bundlerActions)
  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  })

  console.log("UserOp completed")
}

main()
