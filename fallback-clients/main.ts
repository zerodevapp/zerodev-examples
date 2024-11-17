import "dotenv/config"
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient, createFallbackKernelAccountClient } from '@zerodev/sdk'
import { Hex, createPublicClient, http, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";

const zeroDevProjectId = process.env.ZERODEV_PROJECT_ID
const privateKey = process.env.PRIVATE_KEY
if (!zeroDevProjectId || !privateKey) {
  throw new Error("ZERODEV_PROJECT_ID or PRIVATE_KEY is not set")
}

const signer = privateKeyToAccount(privateKey as Hex)
const chain = sepolia
const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
  chain
})
const entryPoint = getEntryPoint("0.7")

async function main() {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion: KERNEL_V3_1
  })

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion: KERNEL_V3_1
  })

  const pimlicoPaymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(process.env.PAYMASTER_RPC + '?provider=PIMLICO'),
  })

  const pimlicoKernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(process.env.BUNDLER_RPC + "_make_it_fail" + '?provider=PIMLICO'),
    paymaster: {
      getPaymasterData(userOperation) {
        return pimlicoPaymasterClient.sponsorUserOperation({ userOperation });
      },
    },
  })

  const alchemyPaymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(process.env.PAYMASTER_RPC + '?provider=ALCHEMY'),
  })

  const alchemyKernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(process.env.BUNDLER_RPC + '?provider=ALCHEMY'),
    paymaster: {
      getPaymasterData(userOperation) {
        return alchemyPaymasterClient.sponsorUserOperation({ userOperation });
      },
    },
  })

  const fallbackKernelClient = createFallbackKernelAccountClient([
    pimlicoKernelClient,
    alchemyKernelClient
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