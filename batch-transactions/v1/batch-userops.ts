import "dotenv/config"
import { zeroAddress } from "viem"
import {
  getKernelV1Account,
  getKernelV1AccountClient,
  getZeroDevPaymasterClient
} from "../../utils"
import { bundlerActions } from "permissionless"

async function main() {
  const kernelAccount = await getKernelV1Account()
  const kernelClient = await getKernelV1AccountClient({
    account: kernelAccount,
    sponsorUserOperation: async ({ userOperation }) => {
      const zerodevPaymaster = getZeroDevPaymasterClient()
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
      return zerodevPaymaster.sponsorUserOperation({
        userOperation,
        entryPoint
      })
    }
  })

  console.log("Account address:", kernelClient.account.address)

  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await kernelClient.account.encodeCallData([
        {
          to: zeroAddress,
          value: BigInt(0),
          data: "0x"
        },
        {
          to: zeroAddress,
          value: BigInt(0),
          data: "0x"
        }
      ])
    }
  })

  console.log("UserOp hash:", userOpHash)
  console.log("Waiting for UserOp to complete...")

  const bundlerClient = kernelClient.extend(bundlerActions)
  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash
  })

  console.log("UserOp completed")
}

main()
