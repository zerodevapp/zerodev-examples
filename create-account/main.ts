import "dotenv/config"
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { http, Hex, createPublicClient, zeroAddress, Address } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { KERNEL_V3_1 } from "@zerodev/sdk/constants"
import {
  entryPoint07Address,
  EntryPointVersion,
} from "viem/account-abstraction"

if (
  !process.env.ZERODEV_RPC ||
  !process.env.PRIVATE_KEY
) {
  throw new Error("ZERODEV_RPC or PRIVATE_KEY is not set")
}

const chain = sepolia
const publicClient = createPublicClient({
  // Use your own RPC for public client in production
  transport: http(process.env.ZERODEV_RPC),
  chain,
})

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
const entryPoint = {
  address: entryPoint07Address as Address,
  version: "0.7" as EntryPointVersion,
}
const kernelVersion = KERNEL_V3_1

const main = async () => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  })

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion,
  })
  console.log("My account:", account.address)

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(process.env.ZERODEV_RPC),
  })

  const kernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(process.env.ZERODEV_RPC),
    client: publicClient,
    paymaster: {
      getPaymasterData: (userOperation) => {
        return paymasterClient.sponsorUserOperation({
          userOperation,
        })
      }
    }
  })

  const userOpHash = await kernelClient.sendUserOperation({
    callData: await account.encodeCalls([
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  })

  console.log("userOp hash:", userOpHash)

  const _receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  })
  console.log('bundle txn hash: ', _receipt.receipt.transactionHash)

  console.log("userOp completed")

  process.exit(0);
}

main()
