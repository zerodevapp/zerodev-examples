import "dotenv/config"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import {
    createKernelAccount,
    createKernelAccountClient,
    createZeroDevPaymasterClient,
    gasTokenAddresses
} from "@zerodev/sdk"
import { ENTRYPOINT_ADDRESS_V06 } from "permissionless"
import { createPublicClient, http, zeroAddress } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"

const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
});

const signer = privateKeyToAccount(generatePrivateKey());
const entryPoint = ENTRYPOINT_ADDRESS_V06;

const chain = sepolia

const main = async () => {
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer,
        entryPoint
    })

    const account = await createKernelAccount(publicClient, {
        plugins: {
            sudo: ecdsaValidator
        },
        entryPoint,
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

    const result = await paymasterClient.estimateGasInERC20({
        userOperation,
        gasTokenAddress: gasTokenAddresses[chain.id]["6TEST"]
    })

    console.log(`fee: ${result.amount} test tokens`)
}

main();
