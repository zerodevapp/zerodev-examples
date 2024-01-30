import "dotenv/config"
import { createEcdsaKernelAccountClient } from "@zerodev/presets/zerodev"
import { Hex, zeroAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { polygonMumbai } from "viem/chains"

const zeroDevProjectId = process.env.ZERODEV_PROJECT_ID
const privateKey = process.env.PRIVATE_KEY
if (!zeroDevProjectId || !privateKey) {
  throw new Error("ZERODEV_PROJECT_ID or PRIVATE_KEY is not set")
}

const signer = privateKeyToAccount(privateKey as Hex)

const main = async () => {
  const kernelClient = await createEcdsaKernelAccountClient({
    // required
    chain: polygonMumbai,
    projectId: zeroDevProjectId,
    signer,

    // optional
    provider: "STACKUP", // defaults to a recommended provider
    index: BigInt(1), // defaults to 0
    paymaster: 'SPONSOR', // defaults to SPONSOR
  })

  console.log("My account:", kernelClient.account.address)

  const txnHash = await kernelClient.sendTransaction({
    to: zeroAddress,
    value: BigInt(0),
    data: "0x",
  })

  console.log("txn hash:", txnHash)

  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await kernelClient.account.encodeCallData({
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      }),
    },
  })

  console.log("userOp hash:", userOpHash)
}

main()
