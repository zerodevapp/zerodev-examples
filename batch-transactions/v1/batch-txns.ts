import "dotenv/config"
import { zeroAddress } from "viem"
import {
  getKernelV1Account,
  getKernelV1AccountClient,
  getZeroDevPaymasterClient
} from "../../utils"

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

  const txnHash = await kernelClient.sendTransactions({
    transactions: [
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
    ]
  })

  console.log("Txn hash:", txnHash)
}

main()
