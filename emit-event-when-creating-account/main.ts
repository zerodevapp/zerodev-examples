import "dotenv/config"
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
  getUserOperationGasPrice,
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import {
  http,
  Hex,
  createPublicClient,
  zeroAddress,
  Address,
  concatHex,
  decodeEventLog,
  parseAbi,
} from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import {
  KERNEL_V3_1,
  PLUGIN_TYPE,
  VALIDATOR_TYPE,
} from "@zerodev/sdk/constants"
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
  transport: http(process.env.ZERODEV_RPC),
  chain,
})

const signer = privateKeyToAccount(
  generatePrivateKey() ?? (process.env.PRIVATE_KEY as Hex)
)
const entryPoint = {
  address: entryPoint07Address as Address,
  version: "0.7" as EntryPointVersion,
}
const kernelVersion = KERNEL_V3_1
const identifierEmittedAbi = parseAbi([
  "event IdentifierEmitted(bytes id, address indexed kernel)",
])

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
    pluginMigrations: [
      {
        address: "0x43C757131417c5a245a99c4D5B7722ec20Cb0b31",
        type: PLUGIN_TYPE.VALIDATOR,
        // Identifier
        data: "0xb33f",
      },
    ],
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
    },
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
  console.log({ txHash: _receipt.receipt.transactionHash })

  for (const log of _receipt.logs) {
    try {
      const event = decodeEventLog({
        abi: identifierEmittedAbi,
        ...log,
      })
      if (event.eventName === "IdentifierEmitted") {
        console.log({ id: event.args.id, kernel: event.args.kernel })
      }
    } catch { }
  }
  console.log("userOp completed")
}

main()
