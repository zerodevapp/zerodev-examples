import "dotenv/config"
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
  getERC20PaymasterApproveCall,
  gasTokenAddresses,
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { UserOperation, bundlerActions } from "permissionless"
import { http, Hex, createPublicClient, zeroAddress, encodeFunctionData, parseAbi, parseEther } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { polygonMumbai } from "viem/chains"

if (!process.env.BUNDLER_RPC || !process.env.PAYMASTER_RPC || !process.env.PRIVATE_KEY) {
  throw new Error("BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY is not set")
}

const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
})

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)

const TEST_ERC20_ABI = parseAbi([
  "function mint(address to, uint256 amount) external",
])

const main = async () => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
  })

  const account = await createKernelAccount(publicClient, {
    plugins: {
      validator: ecdsaValidator,
    }
  })

  const paymasterClient = createZeroDevPaymasterClient({
    chain: polygonMumbai,
    transport: http(process.env.PAYMASTER_RPC),
  })

  const kernelClient = createKernelAccountClient({
    account,
    chain: polygonMumbai,
    transport: http(process.env.BUNDLER_RPC),
    sponsorUserOperation: async ({ userOperation }): Promise<UserOperation> => {
      return paymasterClient.sponsorUserOperation({
        userOperation,
        gasToken: gasTokenAddresses[polygonMumbai.id]['6TEST'],
      })
    },
  })

  console.log("My account:", account.address)

  // In this example, just for convenience, we mint and approve the test
  // tokens within the same batch, but you don't have to do that.
  //
  // You just need to make sure that the account has enough ERC20 tokens
  // and that it has approved the paymaster with enough tokens to pay for
  // the gas.
  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await account.encodeCallData([
        {
          to: gasTokenAddresses[polygonMumbai.id]["6TEST"],
          data: encodeFunctionData({
            abi: TEST_ERC20_ABI,
            functionName: "mint",
            args: [account.address, BigInt(100000)]
          }),
          value: BigInt(0)
        },
        await getERC20PaymasterApproveCall(paymasterClient, {
          gasToken: gasTokenAddresses[polygonMumbai.id]["6TEST"],
          approveAmount: parseEther('0.1'),
        }),
        {
          to: zeroAddress,
          value: BigInt(0),
          data: "0x",
        },
      ]),
    },
  })

  console.log("UserOp hash:", userOpHash)

  const bundlerClient = kernelClient.extend(bundlerActions)
  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  })

  console.log("UserOp completed")
}

main()
