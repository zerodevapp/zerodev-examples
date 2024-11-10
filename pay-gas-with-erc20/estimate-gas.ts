import "dotenv/config"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import {
    createKernelAccount,
    createKernelAccountClient,
    createZeroDevPaymasterClient,
    gasTokenAddresses
} from "@zerodev/sdk"
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless"
import { createPublicClient, http, zeroAddress } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";

const chain = sepolia
const publicClient = createPublicClient({
    transport: http(process.env.BUNDLER_RPC),
    chain
});

const signer = privateKeyToAccount(generatePrivateKey());
const entryPoint = ENTRYPOINT_ADDRESS_V07;


const main = async () => {
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer,
        entryPoint,
        kernelVersion: KERNEL_V3_1
    })

    const account = await createKernelAccount(publicClient, {
        plugins: {
            sudo: ecdsaValidator
        },
        entryPoint,
        kernelVersion: KERNEL_V3_1
    })

    const paymasterClient = createZeroDevPaymasterClient({
        chain,
        entryPoint,
        transport: http(process.env.PAYMASTER_RPC)
    })

    const kernelClient = createKernelAccountClient({
        account,
        chain,
        entryPoint,
        bundlerTransport: http(process.env.BUNDLER_RPC),
        middleware: {
            sponsorUserOperation: async ({ userOperation }) => {
                return paymasterClient.sponsorUserOperation({
                    userOperation,
                    entryPoint
                })
            }
        },
    })

    const userOperation = await kernelClient.prepareUserOperationRequest({
        userOperation: {
            callData: await account.encodeCallData({
                to: zeroAddress,
                value: BigInt(0),
                data: "0x",
            }),
        },
        account,
    });

    const SEPOLIA_USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
    const result = await paymasterClient.estimateGasInERC20({
        userOperation,
        gasTokenAddress: SEPOLIA_USDC_ADDRESS,
        entryPoint
    })

    console.log(`fee: ${result.amount} test tokens`)
}

main();
