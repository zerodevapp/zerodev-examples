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
    toGasPolicy,
    toRateLimitPolicy
} from "@zerodev/permissions/policies"
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless"
import {
    http,
    Hex,
    createPublicClient,
    parseEther,
    parseAbi,
    encodeFunctionData
} from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";

const contractAddress = "0x34bE7f35132E97915633BC1fc020364EA5134863"
const contractABI = parseAbi([
    "function mint(address _to) public",
    "function balanceOf(address owner) external view returns (uint256 balance)"
])

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
                    toGasPolicy({
                        allowed: BigInt(parseEther("10")),
                        enforcePaymaster: true
                    }),
                    toRateLimitPolicy({
                        count: 100,
                        interval: 10
                    }),
                    toCallPolicy({
                        policyVersion: CallPolicyVersion.V0_0_2,
                        permissions: [
                            {
                                abi: contractABI,
                                target: contractAddress,
                                functionName: "mint",
                                args: [
                                    {
                                        condition: ParamCondition.EQUAL,
                                        value: randomAccount.address
                                    }
                                ]
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

    const userOpHash = await kernelClient.sendUserOperation({
        userOperation: {
            callData: await account.encodeCallData({
                to: contractAddress,
                value: BigInt(0),
                data: encodeFunctionData({
                    abi: contractABI,
                    functionName: "mint",
                    args: [randomAccount.address]
                })
            })
        }
    })

    console.log("userOp hash:", userOpHash)

    const bundlerClient = kernelClient.extend(bundlerActions(entryPoint))
    const _receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash
    })

    console.log("userOp completed")
}

main()
