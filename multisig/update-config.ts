/**
 * In this example, we will first create a multisig with two signers, then we
 * will update the config to add a third signer.
 */

import "dotenv/config"
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient
} from "@zerodev/sdk"
import { UserOperation } from "permissionless"
import { http, createPublicClient, zeroAddress } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { polygonMumbai } from "viem/chains"
import {
  createWeightedECDSAValidator,
  getUpdateConfigCall
} from "@zerodev/weighted-ecdsa-validator"
import { WeightedValidatorAbi } from "@zerodev/weighted-ecdsa-validator/abi"

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

const signer1 = privateKeyToAccount(generatePrivateKey())
const signer2 = privateKeyToAccount(generatePrivateKey())
const signer3 = privateKeyToAccount(generatePrivateKey())

console.log("signer1:", signer1.address)
console.log("signer2:", signer2.address)
console.log("signer3:", signer3.address)

const main = async () => {
  const multisigValidator = await createWeightedECDSAValidator(publicClient, {
    config: {
      threshold: 100,
      signers: [
        { address: signer1.address, weight: 50 },
        { address: signer2.address, weight: 50 }
      ]
    },
    signers: [signer1, signer2]
  })

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: multisigValidator
    }
  })

  const kernelClient = createKernelAccountClient({
    account,
    chain: polygonMumbai,
    transport: http(process.env.BUNDLER_RPC),
    sponsorUserOperation: async ({ userOperation }): Promise<UserOperation> => {
      const kernelPaymaster = createZeroDevPaymasterClient({
        chain: polygonMumbai,
        transport: http(process.env.PAYMASTER_RPC)
      })
      return kernelPaymaster.sponsorUserOperation({
        userOperation
      })
    }
  })

  console.log("My account:", kernelClient.account.address)

  console.log("sending userOp with signer 1 and 2...")
  await kernelClient.sendTransaction({
    to: zeroAddress,
    value: BigInt(0),
    data: "0x"
  })
  console.log("userOp sent")

  console.log("sending second userOp with signer 1 and 2...")
  await kernelClient.sendTransaction({
    to: zeroAddress,
    value: BigInt(0),
    data: "0x"
  })
  console.log("second userOp sent")

  const storageBefore = await publicClient.readContract({
    address: "0xf230ac0AD98F81cd9806b5A6B16f8Fb92Fb6Fc48",
    abi: WeightedValidatorAbi,
    functionName: "weightedStorage",
    args: [account.address]
  })

  console.log("weigthed storage:", storageBefore)

  console.log("updating config to add signer 3...")
  await kernelClient.sendTransaction(
    getUpdateConfigCall({
      threshold: 100,
      signers: [
        { address: signer1.address, weight: 50 },
        { address: signer2.address, weight: 50 },
        { address: signer3.address, weight: 50 }
      ]
    })
  )

  console.log("userOp sent")

  const storageAfter = await publicClient.readContract({
    address: "0xf230ac0AD98F81cd9806b5A6B16f8Fb92Fb6Fc48",
    abi: WeightedValidatorAbi,
    functionName: "weightedStorage",
    args: [account.address]
  })

  console.log("new weigthed storage:", storageAfter)

  const multisigValidator2 = await createWeightedECDSAValidator(publicClient, {
    signers: [signer1, signer2, signer3]
  })

  const account2 = await createKernelAccount(publicClient, {
    deployedAccountAddress: account.address,
    plugins: {
      sudo: multisigValidator2
    }
  })

  const kernelClient2 = createKernelAccountClient({
    account: account2,
    chain: polygonMumbai,
    transport: http(process.env.BUNDLER_RPC),
    sponsorUserOperation: async ({ userOperation }): Promise<UserOperation> => {
      const kernelPaymaster = createZeroDevPaymasterClient({
        chain: polygonMumbai,
        transport: http(process.env.PAYMASTER_RPC)
      })
      return kernelPaymaster.sponsorUserOperation({
        userOperation
      })
    }
  })

  console.log("sending userOp with signer 1, 2 and 3...")
  await kernelClient2.sendTransaction({
    to: zeroAddress,
    value: BigInt(0),
    data: "0x"
  })
  console.log("userOp sent")

  console.log("sending userOp with signer 1 and 2 again...")
  await kernelClient.sendTransaction({
    to: zeroAddress,
    value: BigInt(0),
    data: "0x"
  })
  console.log("userOp sent")
}

main()
