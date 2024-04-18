import "dotenv/config"
import {
    createKernelAccount,
    createZeroDevPaymasterClient,
    createKernelAccountClient
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { toPermissionValidator } from "@zerodev/permissions"
import {
    SessionKeySignerMode,
    toRemoteSessionKeySigner
} from "@zerodev/permissions/signers"
import { toSudoPolicy } from "@zerodev/permissions/policies"
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless"
import { http, Hex, createPublicClient, zeroAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"

const SESSION_KEY_STORAGE_URL = "https://keys.zerodev.app/turnkey/v1"

if (
    !process.env.BUNDLER_RPC ||
    !process.env.PAYMASTER_RPC ||
    !process.env.PRIVATE_KEY ||
    !process.env.ZERODEV_API_KEY
) {
    throw new Error(
        "BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY or ZERODEV_API_KEY is not set"
    )
}

const publicClient = createPublicClient({
    transport: http(process.env.BUNDLER_RPC)
})

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
const chain = sepolia
const entryPoint = ENTRYPOINT_ADDRESS_V07
const apiKey = process.env.ZERODEV_API_KEY

const main = async () => {
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer,
        entryPoint
    })

    const remoteSessionKeySigner = await toRemoteSessionKeySigner({
        userName: "alice",
        apiKey,
        sessionKeyStorageUrl: SESSION_KEY_STORAGE_URL,
        mode: SessionKeySignerMode.Create
    })

    const permissionPlugin = await toPermissionValidator(publicClient, {
        entryPoint,
        signer: remoteSessionKeySigner,
        policies: [toSudoPolicy({})]
    })

    const account = await createKernelAccount(publicClient, {
        plugins: {
            sudo: ecdsaValidator,
            regular: permissionPlugin
        },
        entryPoint
    })
    console.log("My account:", account.address)

    const kernelClient = createKernelAccountClient({
        account,
        entryPoint,
        chain,
        bundlerTransport: http(process.env.BUNDLER_RPC),
        middleware: {
            sponsorUserOperation: async ({ userOperation }) => {
                const paymasterClient = createZeroDevPaymasterClient({
                    chain,
                    transport: http(process.env.PAYMASTER_RPC),
                    entryPoint
                })
                return paymasterClient.sponsorUserOperation({
                    userOperation,
                    entryPoint
                })
            }
        }
    })

    const txHash = await kernelClient.sendTransaction({
        to: zeroAddress,
        value: BigInt(0),
        data: "0x"
    })

    console.log("txHash hash:", txHash)
}

main()
