// Utilities for examples

import { createEcdsaKernelAccountClient } from "@zerodev/presets/zerodev"
import {
  KernelAccountClient,
  KernelSmartAccount,
  createKernelAccountClient,
  createKernelV1Account,
  createZeroDevPaymasterClient
} from "@zerodev/sdk"
import { SmartAccount } from "permissionless/accounts"
import { SponsorUserOperationMiddleware } from "permissionless/actions/smartAccount"
import { Chain, Hex, Transport, createPublicClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { polygonMumbai } from "viem/chains"

const zeroDevProjectId = process.env.ZERODEV_PROJECT_ID
const privateKey = process.env.PRIVATE_KEY
if (!zeroDevProjectId || !privateKey) {
  throw new Error("ZERODEV_PROJECT_ID or PRIVATE_KEY is not set")
}

const signer = privateKeyToAccount(privateKey as Hex)

export const getKernelClient = async () => {
  return await createEcdsaKernelAccountClient({
    // required
    chain: polygonMumbai,
    projectId: zeroDevProjectId,
    signer
  })
}

export const getKernelV1Account = async (): Promise<SmartAccount> => {
  const privateKey = process.env.PRIVATE_KEY as Hex
  if (!privateKey) {
    throw new Error("PRIVATE_KEY environment variable not set")
  }

  const rpcUrl = process.env.BUNDLER_RPC
  if (!rpcUrl) {
    throw new Error("BUNDLER_RPC environment variable not set")
  }

  const publicClient = createPublicClient({
    transport: http(rpcUrl)
  })
  const signer = privateKeyToAccount(privateKey)

  return createKernelV1Account(publicClient, {
    signer,
    index: BigInt(0)
  })
}

export const getKernelV1AccountClient = async ({
  account,
  sponsorUserOperation
}: SponsorUserOperationMiddleware & {
  account?: SmartAccount
} = {}) => {
  const zeroDevBundlerRpcHost = process.env.BUNDLER_RPC
  return createKernelAccountClient({
    account,
    chain: polygonMumbai,
    transport: http(zeroDevBundlerRpcHost),
    sponsorUserOperation
  }) as KernelAccountClient<Transport, Chain, KernelSmartAccount>
}

export const getZeroDevPaymasterClient = () => {
  if (!process.env.PAYMASTER_RPC)
    throw new Error("PAYMASTER_RPC environment variable not set")

  const paymasterRpc = process.env.PAYMASTER_RPC

  return createZeroDevPaymasterClient({
    chain: polygonMumbai,
    transport: http(paymasterRpc)
  })
}

export const getZeroDevERC20PaymasterClient = () => {
  if (!process.env.ZERODEV_PROJECT_ID)
    throw new Error("ZERODEV_PROJECT_ID environment variable not set")

  return createZeroDevPaymasterClient({
    chain: polygonMumbai,
    transport: http(
      process.env.PAYMASTER_RPC ||
        "https://rpc.zerodev.app/api/v2/paymaster/" +
          process.env.ZERODEV_PROJECT_ID
    )
  })
}
