import "dotenv/config"
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless"
import { http, Hex, createPublicClient, zeroAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { toMultiChainECDSAValidator } from '@zerodev/multi-chain-validator'

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
const kernelVersion = KERNEL_V3_1

const main = async () => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  })

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion,
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
          entryPoint,
        })
        return paymasterClient.sponsorUserOperation({
          userOperation,
          entryPoint,
        })
      },
    },
  })

  // initialize multiChainECDSAValidatorPlugin
  const multiChainECDSAValidatorPlugin =
  await toMultiChainECDSAValidator(publicClient, {
      entryPoint,
      kernelVersion,
      signer
  })

  /**
   * @dev In this example, we initialize kernel with ecdsaValidator as sudoValidator and then change it to multiChainECDSAValidatorPlugin. But in most cases, these are separate actions since you would want to change sudoValidator to a different one after deploying the kernel.
   */
  const changeSudoValidatorUserOpHash = await kernelClient.changeSudoValidator({
    sudoValidator: multiChainECDSAValidatorPlugin
  })

  console.log("changeSudoValidatorUserOpHash hash:", changeSudoValidatorUserOpHash)

  const bundlerClient = kernelClient.extend(bundlerActions(entryPoint))
  const _receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: changeSudoValidatorUserOpHash,
  })

  console.log("userOp completed")

  // after this, now you can use multiChainECDSAValidatorPlugin as sudoValidator. For usage of multi-chain validators, refer to the example in `multi-chain` directory. For multi-chain webauthn validator, refer to this [repo](https://github.com/zerodevapp/multi-chain-passkey-example)
}

main()
