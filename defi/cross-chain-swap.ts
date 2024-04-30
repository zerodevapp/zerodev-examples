import "dotenv/config"
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless"
import { http, Hex, createPublicClient } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { arbitrum, polygon } from "viem/chains"
import { createKernelDefiClient, baseTokenAddresses } from "@zerodev/defi"

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

  const userOpHash = await defiClient.sendSwapUserOpCrossChain({
    fromToken: baseTokenAddresses[chain.id].USDC,
    fromAmount: BigInt('100000'),
    toChainId: polygon.id,
    toToken: baseTokenAddresses[polygon.id].USDT,
    gasToken: 'sponsored',
  })
  console.log("userOp hash:", userOpHash)

  const bundlerClient = kernelClient.extend(bundlerActions(entryPoint))
  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  })

  console.log("userOp completed")
}

main()
