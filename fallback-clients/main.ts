import "dotenv/config"
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient, createFallbackKernelAccountClient } from '@zerodev/sdk'
import { ENTRYPOINT_ADDRESS_V07 } from 'permissionless'
import { Hex, createPublicClient, http, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const zeroDevProjectId = process.env.ZERODEV_PROJECT_ID
const privateKey = process.env.PRIVATE_KEY
if (!zeroDevProjectId || !privateKey) {
  throw new Error("ZERODEV_PROJECT_ID or PRIVATE_KEY is not set")
}

const signer = privateKeyToAccount(privateKey as Hex)
const chain = sepolia
const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
})
const entryPoint = ENTRYPOINT_ADDRESS_V07

async function main() {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint
  })

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint
  })

  const pimlicoKernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(process.env.BUNDLER_RPC + '?provider=PIMLICO'),
    middleware: {
      sponsorUserOperation: async ({ userOperation }) => {
        const pimlicoPaymasterClient = createZeroDevPaymasterClient({
          chain,
          transport: http(process.env.PAYMASTER_RPC + '?provider=PIMLICO'),
          entryPoint
        })
        return pimlicoPaymasterClient.sponsorUserOperation({
          userOperation,
          entryPoint,
        })
      }
    },
    entryPoint
  })

  const stackupKernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(process.env.BUNDLER_RPC + '?provider=STACKUP'),
    middleware: {
      sponsorUserOperation: async ({ userOperation }) => {
        const stackupPaymasterClient = createZeroDevPaymasterClient({
          chain,
          transport: http(process.env.PAYMASTER_RPC + '?provider=STACKUP'),
          entryPoint
        })
        return stackupPaymasterClient.sponsorUserOperation({
          userOperation,
          entryPoint,
        })
      }
    },
    entryPoint
  })

  const fallbackKernelClient = createFallbackKernelAccountClient([
    pimlicoKernelClient,
    stackupKernelClient
  ])

  console.log("Account address:", fallbackKernelClient.account.address)

  const txHash = await fallbackKernelClient.sendTransaction({
    to: zeroAddress,
    value: BigInt(0),
    data: "0x"
  })

  console.log("Txn hash:", txHash)
}

main()