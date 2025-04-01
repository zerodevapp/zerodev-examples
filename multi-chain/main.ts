import dotenv from "dotenv"
import {
    prepareAndSignUserOperations,
    toMultiChainECDSAValidator
} from "@zerodev/multi-chain-ecdsa-validator"
import {
    createKernelAccount,
    createKernelAccountClient,
    createZeroDevPaymasterClient
} from "@zerodev/sdk"
import {
    Chain,
    Client,
    Hex,
    Transport,
    createPublicClient,
    http,
    zeroAddress
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { optimismSepolia, sepolia } from "viem/chains"
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants"
import { SmartAccount } from "viem/account-abstraction"

dotenv.config()

if (
    !process.env.PRIVATE_KEY ||
    !process.env.RPC_URL ||
    !process.env.OPTIMISM_SEPOLIA_RPC_URL ||
    !process.env.ZERODEV_RPC ||
    !process.env.OPTIMISM_SEPOLIA_ZERODEV_RPC
) {
    console.error(
        "Please set PRIVATE_KEY, RPC_URL, OPTIMISM_SEPOLIA_RPC_URL, ZERODEV_RPC, OPTIMISM_SEPOLIA_ZERODEV_RPC"
    )
    process.exit(1)
}

const PRIVATE_KEY = process.env.PRIVATE_KEY

const SEPOLIA_RPC_URL = process.env.RPC_URL
const OPTIMISM_SEPOLIA_RPC_URL = process.env.OPTIMISM_SEPOLIA_RPC_URL

const SEPOLIA_ZERODEV_RPC_URL = process.env.ZERODEV_RPC
const OPTIMISM_SEPOLIA_ZERODEV_RPC_URL = process.env.OPTIMISM_SEPOLIA_ZERODEV_RPC

const entryPoint = getEntryPoint("0.7")

const main = async () => {
    const sepoliaPublicClient = createPublicClient({
        transport: http(SEPOLIA_RPC_URL),
        chain: sepolia
    })
    const optimismSepoliaPublicClient = createPublicClient({
        transport: http(OPTIMISM_SEPOLIA_RPC_URL),
        chain: optimismSepolia
    })

    const signer = privateKeyToAccount(PRIVATE_KEY as Hex)
    const sepoliaMultiSigECDSAValidatorPlugin =
        await toMultiChainECDSAValidator(sepoliaPublicClient, {
            entryPoint,
            signer,
            kernelVersion: KERNEL_V3_1,
            multiChainIds: [sepolia.id, optimismSepolia.id]
        })
    const optimismSepoliaMultiSigECDSAValidatorPlugin =
        await toMultiChainECDSAValidator(optimismSepoliaPublicClient, {
            entryPoint,
            signer,
            kernelVersion: KERNEL_V3_1,
            multiChainIds: [sepolia.id, optimismSepolia.id]
        })

    const sepoliaKernelAccount = await createKernelAccount(
        sepoliaPublicClient,
        {
            entryPoint,
            plugins: {
                sudo: sepoliaMultiSigECDSAValidatorPlugin
            },
            kernelVersion: KERNEL_V3_1
        }
    )

    const optimismSepoliaKernelAccount = await createKernelAccount(
        optimismSepoliaPublicClient,
        {
            entryPoint,
            plugins: {
                sudo: optimismSepoliaMultiSigECDSAValidatorPlugin
            },
            kernelVersion: KERNEL_V3_1
        }
    )

    console.log("sepoliaKernelAccount.address", sepoliaKernelAccount.address)
    console.log(
        "optimismSepoliaKernelAccount.address",
        optimismSepoliaKernelAccount.address
    )

    const sepoliaZeroDevPaymasterClient = createZeroDevPaymasterClient({
        chain: sepolia,
        transport: http(SEPOLIA_ZERODEV_RPC_URL)
    })

    const opSepoliaZeroDevPaymasterClient = createZeroDevPaymasterClient({
        chain: optimismSepolia,
        transport: http(OPTIMISM_SEPOLIA_ZERODEV_RPC_URL)
    })

    const sepoliaZerodevKernelClient = createKernelAccountClient({
        account: sepoliaKernelAccount,
        chain: sepolia,
        bundlerTransport: http(SEPOLIA_ZERODEV_RPC_URL),
        paymaster: {
            getPaymasterData(userOperation) {
                return sepoliaZeroDevPaymasterClient.sponsorUserOperation({
                    userOperation
                })
            }
        }
    })

    const optimismSepoliaZerodevKernelClient = createKernelAccountClient({
        account: optimismSepoliaKernelAccount,
        chain: optimismSepolia,
        bundlerTransport: http(OPTIMISM_SEPOLIA_ZERODEV_RPC_URL),
        paymaster: {
            getPaymasterData(userOperation) {
                return opSepoliaZeroDevPaymasterClient.sponsorUserOperation({
                    userOperation
                })
            }
        }
    })

    const clients: Client<Transport, Chain, SmartAccount>[] = [
        {
            ...sepoliaZerodevKernelClient
        },
        {
            ...optimismSepoliaZerodevKernelClient
        }
    ]

    const userOps = await Promise.all(
        clients.map(async (client) => {
            return {
                callData: await client.account.encodeCalls([
                    {
                        to: zeroAddress,
                        value: BigInt(0),
                        data: "0x"
                    }
                ])
            }
        })
    )

    const userOpParams = [
        {
            ...userOps[0],
            chainId: sepolia.id
        },
        {
            ...userOps[1],
            chainId: optimismSepolia.id
        }
    ]

    // prepare and sign user operations with multi-chain ecdsa validator
    const signedUserOps = await prepareAndSignUserOperations(
        clients,
        userOpParams
    )
    const sepoliaUserOp = signedUserOps[0]
    const optimismSepoliaUserOp = signedUserOps[1]

    console.log("sending sepoliaUserOp")
    const sepoliaUserOpHash =
        await sepoliaZerodevKernelClient.sendUserOperation(sepoliaUserOp)

    console.log("sepoliaUserOpHash", sepoliaUserOpHash)
    await sepoliaZerodevKernelClient.waitForUserOperationReceipt({
        hash: sepoliaUserOpHash
    })

    console.log("sending optimismSepoliaUserOp")
    const optimismSepoliaUserOpHash =
        await optimismSepoliaZerodevKernelClient.sendUserOperation(
            optimismSepoliaUserOp
        )

    console.log("optimismSepoliaUserOpHash", optimismSepoliaUserOpHash)
    await optimismSepoliaZerodevKernelClient.waitForUserOperationReceipt({
        hash: optimismSepoliaUserOpHash
    })
}

main()
