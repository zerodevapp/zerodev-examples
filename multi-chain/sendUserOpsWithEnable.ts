import dotenv from "dotenv"
import {
    createKernelMultiChainClient,
    ecdsaSignUserOpsWithEnable,
    toMultiChainECDSAValidator
} from "@zerodev/multi-chain-validator"
import { createKernelAccount, createZeroDevPaymasterClient } from "@zerodev/sdk"
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless"
import { EntryPoint } from "permissionless/types/entrypoint"
import { Hex, createPublicClient, http, zeroAddress } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { optimismSepolia, sepolia } from "viem/chains"
import { toECDSASigner } from "@zerodev/permissions/signers"
import { toSudoPolicy } from "@zerodev/permissions/policies"
import { toPermissionValidator } from "@zerodev/permissions"

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

    const sepoliaEcdsaSigner = privateKeyToAccount(generatePrivateKey())
    const sepoliaEcdsaModularSigner = toECDSASigner({
        signer: sepoliaEcdsaSigner
    })

    const optimismSepoliaEcdsaSigner = privateKeyToAccount(generatePrivateKey())
    const optimismSepoliaEcdsaModularSigner = toECDSASigner({
        signer: optimismSepoliaEcdsaSigner
    })

    const sudoPolicy = toSudoPolicy({})

    const sepoliaPermissionPlugin = await toPermissionValidator(
        sepoliaPublicClient,
        {
            entryPoint,
            signer: sepoliaEcdsaModularSigner,
            policies: [sudoPolicy]
        }
    )

    const optimismSepoliaPermissionPlugin = await toPermissionValidator(
        optimismSepoliaPublicClient,
        {
            entryPoint,
            signer: optimismSepoliaEcdsaModularSigner,
            policies: [sudoPolicy]
        }
    )

    const sepoliaKernelAccount = await createKernelAccount(
        sepoliaPublicClient,
        {
            entryPoint,
            plugins: {
                sudo: sepoliaMultiSigECDSAValidatorPlugin,
                regular: sepoliaPermissionPlugin
            }
        }
    )

    const optimismSepoliaKernelAccount = await createKernelAccount(
        optimismSepoliaPublicClient,
        {
            entryPoint,
            plugins: {
                sudo: optimismSepoliaMultiSigECDSAValidatorPlugin,
                regular: optimismSepoliaPermissionPlugin
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
        // We don't use prepareMultiUserOpRequest here because we're sending user ops with regular(permission) validator, unlike the main.ts example.
        // Simply, we don't need to calculate dummy signature with multi chain validator.
        await sepoliaZerodevKernelClient.prepareUserOperationRequest({
            userOperation: {
                callData: await sepoliaKernelAccount.encodeCallData({
                    to: zeroAddress,
                    value: BigInt(0),
                    data: "0x"
                })
            }
        })

    const optimismSepoliaUserOp =
        // We don't use prepareMultiUserOpRequest here because we're sending user ops with regular(permission) validator, unlike the main.ts example.
        // Simply, we don't need to calculate dummy signature with multi chain validator.
        await optimismSepoliaZerodevKernelClient.prepareUserOperationRequest({
            userOperation: {
                callData: await optimismSepoliaKernelAccount.encodeCallData({
                    to: zeroAddress,
                    value: BigInt(0),
                    data: "0x"
                })
            }
        })

    // signUserOpsWithEnable will configure the signature as a combination of enable signatures and actual user operation signatures.
    const signedUserOps = await ecdsaSignUserOpsWithEnable({
        multiChainUserOpConfigsForEnable: [
            {
                account: sepoliaKernelAccount,
                userOp: sepoliaUserOp
            },
            {
                account: optimismSepoliaKernelAccount,
                userOp: optimismSepoliaUserOp
            }
        ]
    })

    const sepoliaBundlerClient = sepoliaZerodevKernelClient.extend(
        bundlerActions(entryPoint)
    )

    const optimismSepoliaBundlerClient =
        optimismSepoliaZerodevKernelClient.extend(bundlerActions(entryPoint))

    // You should send the signed user operations to enable the regular validator with bundler client.
    const sepoliaUserOpHash = await sepoliaBundlerClient.sendUserOperation({
        userOperation: signedUserOps[0]
    })

    console.log("sepoliaUserOpHash", sepoliaUserOpHash)
    await sepoliaBundlerClient.waitForUserOperationReceipt({
        hash: sepoliaUserOpHash
    })

    const optimismSepoliaUserOpHash =
        await optimismSepoliaBundlerClient.sendUserOperation({
            userOperation: signedUserOps[1]
        })

    console.log("optimismSepoliaUserOpHash", optimismSepoliaUserOpHash)
    await optimismSepoliaBundlerClient.waitForUserOperationReceipt({
        hash: optimismSepoliaUserOpHash
    })

    // now you can use sendTransaction or sendUserOperation since you've already enabled the regular validator, which is permission here.
    const sepoliaTxHash = await sepoliaZerodevKernelClient.sendTransaction({
        to: zeroAddress,
        value: BigInt(0),
        data: "0x"
    })
    console.log("sepoliaTxHash", sepoliaTxHash)

    const optimismSepoliaTxHash =
        await optimismSepoliaZerodevKernelClient.sendTransaction({
            to: zeroAddress,
            value: BigInt(0),
            data: "0x"
        })
    console.log("optimismSepoliaTxHash", optimismSepoliaTxHash)
}

main()
