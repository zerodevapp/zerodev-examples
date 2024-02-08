import "dotenv/config"
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk"
import { UserOperation, bundlerActions } from "permissionless"
import { http, createPublicClient, Hex, toFunctionSelector, parseAbi, encodeFunctionData, zeroAddress } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { polygonMumbai } from "viem/chains"
import { createWeightedECDSAValidator } from "@zerodev/weighted-ecdsa-validator"
import { ECDSA_VALIDATOR_ADDRESS, signerToEcdsaValidator } from "@zerodev/ecdsa-validator"

if (!process.env.BUNDLER_RPC || !process.env.PAYMASTER_RPC || !process.env.PRIVATE_KEY) {
  throw new Error("BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY is not set")
}

const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
})

const oldSigner = privateKeyToAccount(generatePrivateKey())
const newSigner = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
const guardian = privateKeyToAccount(generatePrivateKey())

const recoveryExecutorAddress = '0x2f65dB8039fe5CAEE0a8680D2879deB800F31Ae1'
const recoveryExecutorFunction = 'function doRecovery(address _validator, bytes calldata _data)'
const recoveryExecutorSelector = toFunctionSelector(recoveryExecutorFunction)

const main = async () => {

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: oldSigner,
  })

  const guardianValidator = await createWeightedECDSAValidator(publicClient, {
    config: {
      threshold: 100,
      signers: [
        { address: guardian.address, weight: 100 },
      ],
    },
    signers: [guardian]
  })

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
      regular: guardianValidator,
      executorData: {
        executor: recoveryExecutorAddress,
        selector: recoveryExecutorSelector,
      },
    }
  })

  console.log('recovery selector:', recoveryExecutorSelector)

  const kernelClient = createKernelAccountClient({
    account,
    chain: polygonMumbai,
    transport: http(process.env.BUNDLER_RPC),
    sponsorUserOperation: async ({ userOperation }): Promise<UserOperation> => {
      const paymasterClient = createZeroDevPaymasterClient({
        chain: polygonMumbai,
        transport: http(process.env.PAYMASTER_RPC),
      })
      return paymasterClient.sponsorUserOperation({
        userOperation,
      })
    },
  })

  console.log('performing recovery...')
  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: encodeFunctionData({
        abi: parseAbi([recoveryExecutorFunction]),
        functionName: 'doRecovery',
        args: [ECDSA_VALIDATOR_ADDRESS, newSigner.address],
      })
    },
  })

  console.log('recovery userOp hash:', userOpHash)

  const bundlerClient = kernelClient.extend(bundlerActions)
  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  })

  console.log('recovery completed!')

  const newEcdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: newSigner,
  })

  const newAccount = await createKernelAccount(publicClient, {
    deployedAccountAddress: account.address,
    plugins: {
      sudo: newEcdsaValidator,
    }
  })

  const newKernelClient = createKernelAccountClient({
    account: newAccount,
    chain: polygonMumbai,
    transport: http(process.env.BUNDLER_RPC),
    sponsorUserOperation: async ({ userOperation }): Promise<UserOperation> => {
      const paymasterClient = createZeroDevPaymasterClient({
        chain: polygonMumbai,
        transport: http(process.env.PAYMASTER_RPC),
      })
      return paymasterClient.sponsorUserOperation({
        userOperation,
      })
    },
  })

  console.log('sending userOp with new signer')
  const userOpHash2 = await newKernelClient.sendUserOperation({
    userOperation: {
      callData: await newAccount.encodeCallData({
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      }),
    },
  })
  console.log('userOp hash:', userOpHash2)

  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash2,
  })
  console.log('userOp completed!')
}

main()