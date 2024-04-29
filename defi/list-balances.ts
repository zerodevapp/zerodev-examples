import "dotenv/config"
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless"
import { http, Hex, createPublicClient } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { arbitrum } from "viem/chains"
import { createKernelDefiClient } from "@zerodev/defi"

if (
  !process.env.PRIVATE_KEY ||
  !process.env.ZERODEV_PROJECT_ID
) {
  throw new Error("PRIVATE_KEY or ZERODEV_PROJECT_ID is not set")
}
const projectId = process.env.ZERODEV_PROJECT_ID
const bundlerRpc = `https://rpc.zerodev.app/api/v2/bundler/${projectId}`
const paymasterRpc = `https://rpc.zerodev.app/api/v2/paymaster/${projectId}`

const publicClient = createPublicClient({
  transport: http(bundlerRpc),
})

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
const chain = arbitrum
const entryPoint = ENTRYPOINT_ADDRESS_V07

const main = async () => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
  })

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
  })
  console.log("My account:", account.address)

  const kernelClient = createKernelAccountClient({
    account,
    entryPoint,
    chain,
    bundlerTransport: http(bundlerRpc),
    middleware: {
      sponsorUserOperation: async ({ userOperation }) => {
        const paymasterClient = createZeroDevPaymasterClient({
          chain,
          transport: http(paymasterRpc),
          entryPoint,
        })
        return paymasterClient.sponsorUserOperation({
          userOperation,
          entryPoint,
        })
      },
    },
  });
  const defiClient = createKernelDefiClient(kernelClient, projectId)

  const eoaBalances = await defiClient.listTokenBalances({
    account: signer.address,
    chainId: chain.id 
  }) 
  console.log("eoaBalances:", eoaBalances)

  const accountBalances = await defiClient.listTokenBalances({
    account: account.address,
    chainId: chain.id 
  }) 
  console.log("accountBalances:", accountBalances)
}

main()
