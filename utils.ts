// Utilities for examples

import { createEcdsaKernelAccountClient } from "@kerneljs/presets/zerodev"
import { Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { polygonMumbai } from "viem/chains"

const zeroDevProjectId = process.env.ZERODEV_PROJECT_ID
const privateKey = process.env.PRIVATE_KEY
if (!zeroDevProjectId || !privateKey) {
  throw new Error("ZERODEV_PROJECT_ID or PRIVATE_KEY is not set")
}

const signer = privateKeyToAccount(privateKey as Hex)

export const getKernelClient = async () => {
  return await createEcdsaKernelAccountClient({
    // required
    chain: polygonMumbai,
    projectId: zeroDevProjectId,
    signer,

    provider: "ALCHEMY",
  })
}