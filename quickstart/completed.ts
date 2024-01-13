import "dotenv/config"
import { createEcdsaKernelAccountClient } from "@kerneljs/presets/zerodev"
import { Hex, encodeFunctionData, parseAbi, publicActions, zeroAddress } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { polygonMumbai } from "viem/chains"
import { bundlerActions } from "permissionless"

const ZERODEV_PROJECT_ID = ''

const zeroDevProjectId = ZERODEV_PROJECT_ID || process.env.ZERODEV_PROJECT_ID
if (!zeroDevProjectId) {
  throw new Error("ZERODEV_PROJECT_ID is not set")
}

const privateKey = process.env.PRIVATE_KEY || generatePrivateKey()
const signer = privateKeyToAccount(privateKey as Hex)

// The NFT contract we will be interacting with
const contractAddress = '0x34bE7f35132E97915633BC1fc020364EA5134863'
const contractABI = parseAbi([
  'function mint(address _to) public',
  'function balanceOf(address owner) external view returns (uint256 balance)'
])

const main = async () => {
  const kernelClient = await createEcdsaKernelAccountClient({
    chain: polygonMumbai,
    projectId: zeroDevProjectId,
    signer,
  })

  const accountAddress = kernelClient.account.address
  console.log("My account:", accountAddress)

  // Send a UserOp
  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await kernelClient.account.encodeCallData({
        to: contractAddress as Hex,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: contractABI,
          functionName: "mint",
          args: [accountAddress],
        })
      })
    }
  })
  console.log("Waiting for UserOp:", userOpHash)

  // Wait for the UserOp to be included on-chain
  const bundlerClient = kernelClient.extend(bundlerActions)

  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  })

  // Print NFT balance
  const publicClient = kernelClient.extend(publicActions)

  const nftBalanceAfter = await publicClient.readContract({
    address: contractAddress,
    abi: contractABI,
    functionName: 'balanceOf',
    args: [accountAddress],
  })
  console.log(`NFT balance: ${nftBalanceAfter}`)
}

main()
