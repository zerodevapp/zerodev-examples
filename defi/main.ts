import "dotenv/config"
import {
  createKernelAccount
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { bundlerActions } from "permissionless"
import { http, Hex, createPublicClient, createClient } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { arbitrum } from "viem/chains"
import { createDefiClient, defiTokenAddresses } from "@zerodev/defi"

if (!process.env.BUNDLER_RPC || !process.env.ZERODEV_PROJECT_ID || !process.env.PRIVATE_KEY) {
  throw new Error("BUNDLER_RPC or ZERODEV_PROJECT_ID or PRIVATE_KEY is not set")
}

const chain = arbitrum

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)

const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
})

const bundlerClient = createClient({
  chain,
  transport: http(process.env.BUNDLER_RPC),
}).extend(bundlerActions)

const main = async () => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
  })

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
  })

  console.log("My account:", account.address)

  const defiClient = createDefiClient({
    chain,
    account: account as any,
    projectId: process.env.ZERODEV_PROJECT_ID!,
  })

  const userOperation = await defiClient.getSwapUserOp({
    tokenIn: 'USDC',
    amountIn: '100',
    tokenOut: defiTokenAddresses[chain.id]['USDC']['aave-v3'],
    gasToken: 'sponsored',
  })

  const userOpHash = await bundlerClient.sendUserOperation({
    userOperation: userOperation as any,
    entryPoint: account.entryPoint,
  })

  console.log("userOp hash:", userOpHash)
}

main()
