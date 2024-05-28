import dotenv from "dotenv"
import {
    createKernelMultiChainClient,
    toMultiChainECDSAValidator
} from "@zerodev/multi-chain-validator"
import {
    addressToEmptyAccount,
    createKernelAccount,
    createZeroDevPaymasterClient
} from "@zerodev/sdk"
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless"
import { EntryPoint } from "permissionless/types/entrypoint"
import { Hex, createPublicClient, http, zeroAddress } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { optimismSepolia, sepolia } from "viem/chains"
import { toECDSASigner } from "@zerodev/permissions/signers"
import { toSudoPolicy } from "@zerodev/permissions/policies"
import {
    deserializePermissionAccount,
    serializeMultiChainPermissionAccounts,
    toPermissionValidator
} from "@zerodev/permissions"

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

    const sepoliaSessionKeyAccount = privateKeyToAccount(generatePrivateKey())

    const optimismSepoliaSessionKeyAccount = privateKeyToAccount(
        generatePrivateKey()
    )

    // create an empty account as the session key signer for approvals
    const sepoliaEmptyAccount = addressToEmptyAccount(
        sepoliaSessionKeyAccount.address
    )
    const optimismSepoliaEmptyAccount = addressToEmptyAccount(
        optimismSepoliaSessionKeyAccount.address
    )

    const sepoliaEmptySessionKeySigner = toECDSASigner({
        signer: sepoliaEmptyAccount
    })

    const optimismSepoliaEmptySessionKeySigner = toECDSASigner({
        signer: optimismSepoliaEmptyAccount
    })

    const sudoPolicy = toSudoPolicy({})

    // create a permission validator plugin with empty account signer
    const sepoliaPermissionPlugin = await toPermissionValidator(
        sepoliaPublicClient,
        {
            entryPoint,
            signer: sepoliaEmptySessionKeySigner,
            policies: [sudoPolicy]
        }
    )

    const optimismSepoliaPermissionPlugin = await toPermissionValidator(
        optimismSepoliaPublicClient,
        {
            entryPoint,
            signer: optimismSepoliaEmptySessionKeySigner,
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

    // serialize multi chain permission account with empty account signer, so get approvals
    const [sepoliaApproval, optimismSepoliaApproval] =
        await serializeMultiChainPermissionAccounts([
            {
                account: sepoliaKernelAccount
            },
            {
                account: optimismSepoliaKernelAccount
            }
        ])

    // get real session key signers
    const sepoliaSessionKeySigner = toECDSASigner({
        signer: sepoliaSessionKeyAccount
    })

    const optimismSepoliaSessionKeySigner = toECDSASigner({
        signer: optimismSepoliaSessionKeyAccount
    })

    // deserialize the permission account with the real session key signers
    const deserializeSepoliaKernelAccount = await deserializePermissionAccount(
        sepoliaPublicClient,
        entryPoint,
        sepoliaApproval,
        sepoliaSessionKeySigner
    )

    const deserializeOptimismSepoliaKernelAccount =
        await deserializePermissionAccount(
            optimismSepoliaPublicClient,
            entryPoint,
            optimismSepoliaApproval,
            optimismSepoliaSessionKeySigner
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
        // use the deserialized permission account
        account: deserializeSepoliaKernelAccount,
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
        // use the deserialized permission account
        account: deserializeOptimismSepoliaKernelAccount,
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

    // send user ops. you don't need additional enables like `signUserOpsWithEnable`, since it already has the approvals with serialized account
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
