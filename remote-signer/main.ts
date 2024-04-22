import "dotenv/config"
import {
    createKernelAccount,
    createZeroDevPaymasterClient,
    createKernelAccountClient
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { toPermissionValidator } from "@zerodev/permissions"
import { toRemoteSigner, RemoteSignerMode } from "@zerodev/remote-signer"
import { toSudoPolicy } from "@zerodev/permissions/policies"
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless"
import { http, Hex, createPublicClient, zeroAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { toECDSASigner } from "@zerodev/permissions/signers"

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

    // first we create the remote signer in create mode
    const remoteSigner = await toRemoteSigner({
        apiKey,
        mode: RemoteSignerMode.Create
    })

    // now we get the ecdsa signer using the remote signer
    const ecdsaSigner = toECDSASigner({ signer: remoteSigner })

    const permissionPlugin = await toPermissionValidator(publicClient, {
        entryPoint,
        signer: ecdsaSigner,
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

    // now we get the remote signer in get mode
    const remoteSignerWithGet = await toRemoteSigner({
        apiKey,
        keyAddress: remoteSigner.address, // specify the account address to get
        mode: RemoteSignerMode.Get
    })

    const ecdsaSigner2 = toECDSASigner({ signer: remoteSignerWithGet })

    const permissionPlugin2 = await toPermissionValidator(publicClient, {
        entryPoint,
        signer: ecdsaSigner2,
        policies: [toSudoPolicy({})]
    })

    const account2 = await createKernelAccount(publicClient, {
        plugins: {
            sudo: ecdsaValidator,
            regular: permissionPlugin2
        },
        entryPoint
    })

    console.log("My account2:", account2.address)

    const kernelClient2 = createKernelAccountClient({
        account: account2,
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

    const txHash2 = await kernelClient2.sendTransaction({
        to: zeroAddress,
        value: BigInt(0),
        data: "0x"
    })

    console.log("txHash hash:", txHash2)
}

main()
