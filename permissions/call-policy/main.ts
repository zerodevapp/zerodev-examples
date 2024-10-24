import "dotenv/config"
import {
    createKernelAccount,
    createZeroDevPaymasterClient,
    createKernelAccountClient
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { toPermissionValidator } from "@zerodev/permissions"
import { toECDSASigner } from "@zerodev/permissions/signers"
import {
    CallPolicyVersion,
    ParamCondition,
    toCallPolicy,
} from "@zerodev/permissions/policies"
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless"
import {
    http,
    Hex,
    createPublicClient,
    encodeFunctionData,
    zeroAddress
} from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { TEST_ERC20Abi } from './Test_ERC20Abi'

const Test_ERC20Address = "0x3870419Ba2BBf0127060bCB37f69A1b1C090992B"

if (
    !process.env.BUNDLER_RPC ||
    !process.env.PAYMASTER_RPC ||
    !process.env.PRIVATE_KEY
) {
    throw new Error("BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY is not set")
}
const chain = sepolia
const publicClient = createPublicClient({
    transport: http(process.env.BUNDLER_RPC),
    chain
})

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)

const entryPoint = ENTRYPOINT_ADDRESS_V07

const main = async () => {
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer,
        entryPoint,
        kernelVersion: KERNEL_V3_1
    })

    const randomAccount = privateKeyToAccount(generatePrivateKey())
    const randomAccount2 = privateKeyToAccount(generatePrivateKey())

    const ecdsaSigner = toECDSASigner({
        signer: privateKeyToAccount(generatePrivateKey())
    })

    const account = await createKernelAccount(publicClient, {
        plugins: {
            sudo: ecdsaValidator,
            regular: await toPermissionValidator(publicClient, {
                entryPoint,
                kernelVersion: KERNEL_V3_1,
                signer: ecdsaSigner,
                policies: [
                    toCallPolicy({
                        policyVersion: CallPolicyVersion.V0_0_2,
                        permissions: [
                            {
                                abi: TEST_ERC20Abi,
                                target: Test_ERC20Address,
                                functionName: "mint",
                                args: [
                                    null,
                                    null
                                ]
                            },
                            {
                                abi: TEST_ERC20Abi,
                                target: Test_ERC20Address,
                                functionName: "transfer",
                                args: [
                                    {
                                        condition: ParamCondition.ONE_OF,
                                        value: [randomAccount.address, randomAccount2.address] // Can transfer to either randomAccount or randomAccount2
                                    },
                                    null
                                ]
                            },
                            {
                                abi: TEST_ERC20Abi,
                                target: zeroAddress, // if you set target as zeroAddress, it means that you are enabling approve function for `ANY` ERC20 token.
                                functionName: "approve",
                                args: [
                                    {
                                        condition: ParamCondition.EQUAL,
                                        value: randomAccount.address
                                    },
                                    null
                                ]
                            },
                            {
                                // you can set condition for native ETH transfers too
                                target: randomAccount.address,
                                valueLimit: BigInt(4337)
                            }
                        ]
                    })
                ]
            })
        },
        entryPoint,
        kernelVersion: KERNEL_V3_1
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

    // mint user op
    const mintUserOpHash = await kernelClient.sendUserOperation({
        userOperation: {
            callData: await account.encodeCallData({
                to: Test_ERC20Address,
                value: BigInt(0),
                data: encodeFunctionData({
                    abi: TEST_ERC20Abi,
                    functionName: "mint",
                    args: [account.address, BigInt(4337)]
                })
            })
        }
    })

    console.log("mint userOp hash:", mintUserOpHash)

    const bundlerClient = kernelClient.extend(bundlerActions(entryPoint))
    const _mintReceipt = await bundlerClient.waitForUserOperationReceipt({
        hash: mintUserOpHash
    })

    console.log("mint userOp completed")

    // transfer user op
    const transferUserOpHash = await kernelClient.sendUserOperation({
        userOperation: {
            callData: await account.encodeCallData({
                to: Test_ERC20Address,
                value: BigInt(0),
                data: encodeFunctionData({
                    abi: TEST_ERC20Abi,
                    functionName: "transfer",
                    args: [randomAccount2.address, BigInt(4337)] // we are sending 4337 tokens to randomAccount2
                })
            })
        }
    })

    console.log("transfer userOp hash:", transferUserOpHash)

    const _transferReceipt = await bundlerClient.waitForUserOperationReceipt({
        hash: transferUserOpHash
    })

    console.log("transfer userOp completed")

    // approve user op
    const approveUserOpHash = await kernelClient.sendUserOperation({
        userOperation: {
            callData: await account.encodeCallData({
                // note that you didn't specify the target address as Test_ERC20Address, but it works because you enabled approve function for ANY ERC20 token.
                to: Test_ERC20Address, 
                value: BigInt(0),
                data: encodeFunctionData({
                    abi: TEST_ERC20Abi,
                    functionName: "approve",
                    args: [randomAccount.address, BigInt(4337)]
                })
            })
        }
    })

    console.log("approve userOp hash:", approveUserOpHash)

    const _approveReceipt = await bundlerClient.waitForUserOperationReceipt({
        hash: approveUserOpHash
    })

    console.log("approve userOp completed")
}

main()
