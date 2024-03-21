import "dotenv/config"
import { createPublicClient, encodeFunctionData, http, parseAbi, publicActions } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { polygonMumbai } from "viem/chains"
import { bundlerActions } from "permissionless"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk"

if (!process.env.ZERODEV_PROJECT_ID) {
  throw new Error("ZERODEV_PROJECT_ID is not set")
}

const BUNDLER_RPC = `https://rpc.zerodev.app/api/v2/bundler/${process.env.ZERODEV_PROJECT_ID}`
const PAYMASTER_RPC = `https://rpc.zerodev.app/api/v2/paymaster/${process.env.ZERODEV_PROJECT_ID}`

// The NFT contract we will be interacting with
const contractAddress = '0x34bE7f35132E97915633BC1fc020364EA5134863'
const contractABI = parseAbi([
  'function mint(address _to) public',
  'function balanceOf(address owner) external view returns (uint256 balance)'
])

// Construct a public client
const publicClient = createPublicClient({
  transport: http(BUNDLER_RPC),
})

const main = async () => {
  // Construct a signer
  const privateKey = generatePrivateKey()
  const signer = privateKeyToAccount(privateKey)

  // Construct a validator
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
  })

  // Construct a Kernel account
  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
  })

  // Construct a Kernel account client
  const kernelClient = createKernelAccountClient({
    account,
    chain: polygonMumbai,
    transport: http(BUNDLER_RPC),
    sponsorUserOperation: async ({ userOperation }) => {
      const zerodevPaymaster = createZeroDevPaymasterClient({
        chain: polygonMumbai,
        transport: http(PAYMASTER_RPC),
      })
      return zerodevPaymaster.sponsorUserOperation({
        userOperation
      })
    }
  })

  const accountAddress = kernelClient.account.address
  console.log("My account:", accountAddress)

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
        })
      })
    }
  })
  console.log("Submitted UserOp:", userOpHash)

  // Wait for the UserOp to be included on-chain
  const bundlerClient = kernelClient.extend(bundlerActions)

  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  })
  console.log("UserOp confirmed:", receipt.userOpHash)

  // Print NFT balance
  const nftBalance = await publicClient.readContract({
    address: contractAddress,
    abi: contractABI,
    functionName: 'balanceOf',
    args: [accountAddress],
  })
  console.log(`NFT balance: ${nftBalance}`)
}

main()
