import "dotenv/config"
import { getKernelClient } from "../utils"
import { zeroAddress } from "viem"

async function main() {
  const kernelClient = await getKernelClient()

  console.log("Account address:", kernelClient.account.address)

  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await kernelClient.account.encodeCallData({
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
        callType: "delegatecall", // default to "call"
      }),
    },
  })

  console.log("UserOp hash:", userOpHash)
}

main()