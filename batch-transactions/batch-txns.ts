import "dotenv/config"
import { zeroAddress } from "viem"
import { getKernelClient } from "../utils"

async function main() {
  const kernelClient = await getKernelClient()

  console.log("Account address:", kernelClient.account.address)

  const txnHash = await kernelClient.sendTransactions({
    transactions: [
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]
  })

  console.log("Txn hash:", txnHash)
}

main()