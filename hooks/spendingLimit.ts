import "dotenv/config"
import {
    createKernelAccount,
    createZeroDevPaymasterClient,
    createKernelAccountClient
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { toPermissionValidator } from "@zerodev/permissions"
import { toECDSASigner } from "@zerodev/permissions/signers"
import { toSudoPolicy } from "@zerodev/permissions/policies"
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless"
import { http, createPublicClient, encodeFunctionData } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { toSpendingLimitHook } from "@zerodev/hooks"
import { TEST_ERC20Abi } from "./Test_ERC20abi"

if (
    !process.env.BUNDLER_RPC ||
    !process.env.PAYMASTER_RPC ||
    !process.env.PRIVATE_KEY
) {
    throw new Error("BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY is not set")
}

const publicClient = createPublicClient({
    transport: http(process.env.BUNDLER_RPC)
})

const signer = privateKeyToAccount(generatePrivateKey())
const chain = sepolia
const entryPoint = ENTRYPOINT_ADDRESS_V07

const Test_ERC20Address = "0x3870419Ba2BBf0127060bCB37f69A1b1C090992B"

const main = async () => {
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer,
        entryPoint
    })

    const ecdsaSigner = toECDSASigner({
        signer: privateKeyToAccount(generatePrivateKey())
    })

    const sudoPolicy = await toSudoPolicy({})

    const permissoinPlugin = await toPermissionValidator(publicClient, {
        signer: ecdsaSigner,
        policies: [sudoPolicy],
        entryPoint
    })

    const spendingLimitHook = await toSpendingLimitHook({
        limits: [{ token: Test_ERC20Address, allowance: BigInt(4337) }]
    })

    const kernelAccount = await createKernelAccount(publicClient, {
        entryPoint,
        plugins: {
            sudo: ecdsaValidator,
            regular: permissoinPlugin,
            hook: spendingLimitHook
        }
    })

    const kernelClient = await createKernelAccountClient({
        account: kernelAccount,
        chain,
        bundlerTransport: http(process.env.BUNDLER_RPC),
        middleware: {
            sponsorUserOperation: async ({ userOperation }) => {
                const zeroDevPaymaster = createZeroDevPaymasterClient({
                    chain: chain,
                    transport: http(process.env.PAYMASTER_RPC),
                    entryPoint
                })
                return zeroDevPaymaster.sponsorUserOperation({
                    userOperation,
                    entryPoint
                })
            }
        },
        entryPoint
    })

    const amountToMint = BigInt(10000)

    const mintData = encodeFunctionData({
        abi: TEST_ERC20Abi,
        functionName: "mint",
        args: [kernelAccount.address, amountToMint]
    })

    const mintTransactionHash = await kernelClient.sendTransaction({
        to: Test_ERC20Address,
        data: mintData
    })

    console.log("Mint transaction hash:", mintTransactionHash)

    const amountToTransfer = BigInt(4337)
    const transferData = encodeFunctionData({
        abi: TEST_ERC20Abi,
        functionName: "transfer",
        args: [signer.address, amountToTransfer]
    })

    const response = await kernelClient.sendTransaction({
        to: Test_ERC20Address,
        data: transferData
    })

    console.log("Transfer transaction hash:", response)

    const transferDataWillFail = encodeFunctionData({
        abi: TEST_ERC20Abi,
        functionName: "transfer",
        args: [signer.address, BigInt(1)]
    })

    try {
        await kernelClient.sendTransaction({
            to: Test_ERC20Address,
            data: transferDataWillFail
        })
    } catch (error) {
        console.log("Transfer failed as expected")
    }
}

main()
