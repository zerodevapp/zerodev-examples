import dotenv from "dotenv"
import {
    ecdsaSignUserOps,
    toMultiChainECDSAValidator,
    createKernelMultiChainClient,
    ValidatorType
} from "@zerodev/multi-chain-validator"
import { createKernelAccount, createZeroDevPaymasterClient } from "@zerodev/sdk"
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless"
import { EntryPoint } from "permissionless/types/entrypoint"
import { Hex, createPublicClient, http, zeroAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { optimismSepolia, sepolia } from "viem/chains"

dotenv.config()

if (
    !process.env.PRIVATE_KEY ||
    !process.env.RPC_URL ||
    !process.env.OPTIMISM_SEPOLIA_RPC_URL ||
    !process.env.BUNDLER_RPC ||
    !process.env.PAYMASTER_RPC ||
    !process.env.OPTIMISM_SEPOLIA_BUNDLER_RPC_URL ||
    !process.env.OPTIMISM_SEPOLIA_PAYMASTER_RPC_URL
) {
    console.error(
        "Please set PRIVATE_KEY, RPC_URL, OPTIMISM_SEPOLIA_RPC_URL, BUNDLER_RPC, PAYMASTER_RPC, OPTIMISM_SEPOLIA_BUNDLER_RPC_URL, OPTIMISM_SEPOLIA_PAYMASTER_RPC_URL"
    )
    process.exit(1)
}

const PRIVATE_KEY = process.env.PRIVATE_KEY

const SEPOLIA_RPC_URL = process.env.RPC_URL
const OPTIMISM_SEPOLIA_RPC_URL = process.env.OPTIMISM_SEPOLIA_RPC_URL

const SEPOLIA_ZERODEV_RPC_URL = process.env.BUNDLER_RPC
const SEPOLIA_ZERODEV_PAYMASTER_RPC_URL = process.env.PAYMASTER_RPC

const OPTIMISM_SEPOLIA_ZERODEV_RPC_URL =
    process.env.OPTIMISM_SEPOLIA_BUNDLER_RPC_URL
const OPTIMISM_SEPOLIA_ZERODEV_PAYMASTER_RPC_URL =
    process.env.OPTIMISM_SEPOLIA_PAYMASTER_RPC_URL

const entryPoint = ENTRYPOINT_ADDRESS_V07 as EntryPoint

const main = async () => {
    const sepoliaPublicClient = createPublicClient({
        transport: http(SEPOLIA_RPC_URL)
    })
    const optimismSepoliaPublicClient = createPublicClient({
        transport: http(OPTIMISM_SEPOLIA_RPC_URL)
    })

    const signer = privateKeyToAccount(PRIVATE_KEY as Hex)
    const sepoliaMultiSigECDSAValidatorPlugin =
        await toMultiChainECDSAValidator(sepoliaPublicClient, {
            entryPoint,
            signer
        })
    const optimismSepoliaMultiSigECDSAValidatorPlugin =
        await toMultiChainECDSAValidator(optimismSepoliaPublicClient, {
            entryPoint,
            signer
        })

    const sepoliaKernelAccount = await createKernelAccount(
        sepoliaPublicClient,
        {
            entryPoint,
            plugins: {
                sudo: sepoliaMultiSigECDSAValidatorPlugin
            }
        }
    )

    const optimismSepoliaKernelAccount = await createKernelAccount(
        optimismSepoliaPublicClient,
        {
            entryPoint,
            plugins: {
                sudo: optimismSepoliaMultiSigECDSAValidatorPlugin
            }
        }
    )

    console.log("sepoliaKernelAccount.address", sepoliaKernelAccount.address)
    console.log(
        "optimismSepoliaKernelAccount.address",
        optimismSepoliaKernelAccount.address
    )

    const sepoliaZeroDevPaymasterClient = createZeroDevPaymasterClient({
        chain: sepolia,
        transport: http(SEPOLIA_ZERODEV_PAYMASTER_RPC_URL),
        entryPoint
    })

    const opSepoliaZeroDevPaymasterClient = createZeroDevPaymasterClient({
        chain: optimismSepolia,
        transport: http(OPTIMISM_SEPOLIA_ZERODEV_PAYMASTER_RPC_URL),
        entryPoint
    })

    // use createKernelMultiChainClient to support multi-chain operations instead of createKernelAccountClient
    const sepoliaZerodevKernelClient = createKernelMultiChainClient({
        account: sepoliaKernelAccount,
        chain: sepolia,
        bundlerTransport: http(SEPOLIA_ZERODEV_RPC_URL),
        middleware: {
            sponsorUserOperation: async ({ userOperation }) => {
                return sepoliaZeroDevPaymasterClient.sponsorUserOperation({
                    userOperation,
                    entryPoint
                })
            }
        },
        entryPoint
    })

    const optimismSepoliaZerodevKernelClient = createKernelMultiChainClient({
        account: optimismSepoliaKernelAccount,
        chain: optimismSepolia,
        bundlerTransport: http(OPTIMISM_SEPOLIA_ZERODEV_RPC_URL),
        middleware: {
            sponsorUserOperation: async ({ userOperation }) => {
                return opSepoliaZeroDevPaymasterClient.sponsorUserOperation({
                    userOperation,
                    entryPoint
                })
            }
        },
        entryPoint
    })

    const sepoliaUserOp =
        await sepoliaZerodevKernelClient.prepareMultiUserOpRequest(
            {
                userOperation: {
                    callData: await sepoliaKernelAccount.encodeCallData({
                        to: zeroAddress,
                        value: BigInt(0),
                        data: "0x"
                    })
                }
            },
            ValidatorType.ECDSA,
            2
        )

    const optimismSepoliaUserOp =
        await optimismSepoliaZerodevKernelClient.prepareMultiUserOpRequest(
            {
                userOperation: {
                    callData: await optimismSepoliaKernelAccount.encodeCallData(
                        {
                            to: zeroAddress,
                            value: BigInt(0),
                            data: "0x"
                        }
                    )
                }
            },
            ValidatorType.ECDSA,
            2
        )

    const signedUserOps = await ecdsaSignUserOps({
        account: sepoliaKernelAccount,
        multiUserOps: [
            { userOperation: sepoliaUserOp, chainId: sepolia.id },
            {
                userOperation: optimismSepoliaUserOp,
                chainId: optimismSepolia.id
            }
        ],
        entryPoint
    })

    const sepoliaBundlerClient = sepoliaZerodevKernelClient.extend(
        bundlerActions(entryPoint)
    )

    const optimismSepoliaBundlerClient =
        optimismSepoliaZerodevKernelClient.extend(bundlerActions(entryPoint))

    console.log("sending sepoliaUserOp")
    // you should use bundler client to send signed user ops
    const sepoliaUserOpHash = await sepoliaBundlerClient.sendUserOperation({
        userOperation: signedUserOps[0]
    })

    console.log("sepoliaUserOpHash", sepoliaUserOpHash)
    await sepoliaBundlerClient.waitForUserOperationReceipt({
        hash: sepoliaUserOpHash
    })

    console.log("sending optimismSepoliaUserOp")
    const optimismSepoliaUserOpHash =
        await optimismSepoliaBundlerClient.sendUserOperation({
            userOperation: signedUserOps[1]
        })

    console.log("optimismSepoliaUserOpHash", optimismSepoliaUserOpHash)
    await optimismSepoliaBundlerClient.waitForUserOperationReceipt({
        hash: optimismSepoliaUserOpHash
    })
}

main()
