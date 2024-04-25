import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient, createFallbackKernelAccountClient } from '@zerodev/sdk'
import { ENTRYPOINT_ADDRESS_V07 } from 'permissionless'
import { createPimlicoBundlerClient, createPimlicoPaymasterClient } from 'permissionless/clients/pimlico'
import { createStackupPaymasterClient } from "permissionless/clients/stackup"
import { Hex, createPublicClient, http, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const zeroDevProjectId = process.env.ZERODEV_PROJECT_ID
const privateKey = process.env.PRIVATE_KEY
if (!zeroDevProjectId || !privateKey) {
    throw new Error("ZERODEV_PROJECT_ID or PRIVATE_KEY is not set")
}

const signer = privateKeyToAccount(privateKey as Hex)
const chain = sepolia
const publicClient = createPublicClient({
    transport: http(process.env.BUNDLER_RPC),
})
const entryPoint = ENTRYPOINT_ADDRESS_V07

async function main() {
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer,
        entryPoint
    })

    const account = await createKernelAccount(publicClient, {
        plugins: {
            sudo: ecdsaValidator,
        },
        entryPoint
    })

    const zeroDevPaymasterClient = createZeroDevPaymasterClient({
        chain,
        transport: http(process.env.PAYMASTER_RPC),
        entryPoint
    })

    const pimlicoPaymasterClient = createPimlicoPaymasterClient({
        chain,
        transport: http(process.env.PIMLICO_PAYMASTER_RPC_URL),
        entryPoint
    })

    const stackupPaymasterClient = createStackupPaymasterClient({
        chain,
        transport: http(process.env.STACKUP_PAYMASTER_RPC_URL),
        entryPoint
    })

    const zerodevKernelClient = createKernelAccountClient({
        account,
        chain,
        bundlerTransport: http(process.env.BUNDLER_RPC),
        middleware: {
            sponsorUserOperation: async ({ userOperation }) => {
                return zeroDevPaymasterClient.sponsorUserOperation({
                    userOperation,
                    entryPoint
                })
            }
        },
        entryPoint
    })

    const pimlicoBundlerClient = createPimlicoBundlerClient({
        transport: http(process.env.PIMLICO_RPC_URL),
        entryPoint
    })

    const pimlicoKernelClient = createKernelAccountClient({
        account,
        chain,
        bundlerTransport: http(process.env.PIMLICO_RPC_URL),
        middleware: {
            gasPrice: async () => {
                return (
                    await pimlicoBundlerClient.getUserOperationGasPrice()
                ).fast
            },
            sponsorUserOperation: async ({ userOperation }) => {
                return pimlicoPaymasterClient.sponsorUserOperation({
                    userOperation
                })
            }
        },
        entryPoint
    })

    const stackupKernelClient = createKernelAccountClient({
        account,
        chain,
        bundlerTransport: http(process.env.STACKUP_RPC_URL),
        middleware: {
            sponsorUserOperation: async ({ userOperation }) => {
                return stackupPaymasterClient.sponsorUserOperation({
                    userOperation,
                    entryPoint,
                    context: {
                        type: "payg"
                    }
                })
            }
        },
        entryPoint
    })

    const fallbackKernelClient = createFallbackKernelAccountClient([
        zerodevKernelClient,
        pimlicoKernelClient,
        stackupKernelClient
    ])

    console.log("Account address:", fallbackKernelClient.account.address)

    const txHash = await fallbackKernelClient.sendTransaction({
        to: zeroAddress,
        value: BigInt(0),
        data: "0x"
    })

    console.log("Txn hash:", txHash)
}

main()