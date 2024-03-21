import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import {
    createKernelAccount,
    createKernelAccountClient,
    createZeroDevPaymasterClient,
    gasTokenAddresses
} from "@zerodev/sdk"
import { UserOperation } from "permissionless"
import { createPublicClient, http, zeroAddress } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { polygonMumbai } from "viem/chains"

const publicClient = createPublicClient({
    transport: http(process.env.BUNDLER_RPC)
})

const signer = privateKeyToAccount(generatePrivateKey())

const main = async () => {
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer
    })

    const account = await createKernelAccount(publicClient, {
        plugins: {
            sudo: ecdsaValidator
        }
    })

    const paymasterClient = createZeroDevPaymasterClient({
        chain: polygonMumbai,
        transport: http(process.env.PAYMASTER_RPC)
    })

    const kernelClient = createKernelAccountClient({
        account,
        chain: polygonMumbai,
        transport: http(process.env.BUNDLER_RPC),
        sponsorUserOperation: async ({
            userOperation
        }): Promise<UserOperation> => {
            return paymasterClient.sponsorUserOperation({
                userOperation
            })
        }
    })

    const userOperation = await kernelClient.prepareUserOperationRequest({
        userOperation: {
            callData: await account.encodeCallData({
                to: zeroAddress,
                value: BigInt(0),
                data: "0x"
            })
        },
        account
    })

    const result = await paymasterClient.estimateGasInERC20({
        userOperation,
        gasTokenAddress: gasTokenAddresses[polygonMumbai.id]["USDC"]
    })

    console.log(`fee: ${result.amount} USDC`)
}

main()
