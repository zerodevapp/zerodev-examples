import "dotenv/config"
import { createEcdsaKernelAccountClient } from "@kerneljs/presets/zerodev"
import { encodeFunctionData, parseAbi, publicActions } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { polygonMumbai } from "viem/chains"
import { bundlerActions } from "permissionless"

if (!process.env.ZERODEV_PROJECT_ID) {
  throw new Error("ZERODEV_PROJECT_ID is not set")
}

// The NFT contract we will be interacting with
const contractAddress = '0x34bE7f35132E97915633BC1fc020364EA5134863'
const contractABI = parseAbi([
  'function mint(address _to) public',
  'function balanceOf(address owner) external view returns (uint256 balance)'
])

const main = async () => {
  // Construct a signer
  const privateKey = generatePrivateKey()
  const signer = privateKeyToAccount(privateKey)

  // Construct a Kernel account client
  const kernelClient = await createEcdsaKernelAccountClient({
    chain: polygonMumbai,
    projectId: process.env.ZERODEV_PROJECT_ID!,
    signer,
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
  const publicClient = kernelClient.extend(publicActions)

  const nftBalance = await publicClient.readContract({
    address: contractAddress,
    abi: contractABI,
    functionName: 'balanceOf',
    args: [accountAddress],
  })
  console.log(`NFT balance: ${nftBalance}`)
}

main()
