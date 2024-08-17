import "dotenv/config"
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
  KernelSmartAccount,
} from "@zerodev/sdk"
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless"
import { http, Hex, createPublicClient, encodeFunctionData, erc20Abi, Chain } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { arbitrum, base } from "viem/chains"
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { createKernelCABClient, supportedTokens } from "@zerodev/cab"
import { toMultiChainECDSAValidator } from "@zerodev/multi-chain-validator"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { ENTRYPOINT_ADDRESS_V07_TYPE } from "permissionless/types/entrypoint"

if (
  !process.env.BUNDLER_RPC ||
  !process.env.PAYMASTER_RPC ||
  !process.env.PRIVATE_KEY
) {
  throw new Error("BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY is not set")
}

const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
})

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
const chain = base
const entryPoint = ENTRYPOINT_ADDRESS_V07
const kernelVersion = KERNEL_V3_1

const waitForUserInput = async () => {
  return new Promise<void>(resolve => {
    process.stdin.once('data', () => {
      resolve()
    })
  })
}

const createCABClientForChain = async (account: KernelSmartAccount<ENTRYPOINT_ADDRESS_V07_TYPE>, chain: Chain) => {
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

  const cabClient = createKernelCABClient(kernelClient, {
    transport: http(process.env.CAB_PAYMASTER_URL)
  })

  return cabClient
}

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

  const cabClient = await createCABClientForChain(account, arbitrum)

  console.log("Enabling CAB for arbitrum...")
  await cabClient.enableCAB({
    tokens: [{ name: "USDC", networks: [arbitrum.id] }]
  })

  const cabClient2 = await createCABClientForChain(account, base)

  console.log("Enabling CAB for base...")
  await cabClient2.enableCAB({
    tokens: [{ name: "USDC", networks: [base.id] }]
  })

  while (true) {
    console.log('Press enter to check CAB balance.  Will proceed when CAB balance is greater than 0.')
    await waitForUserInput()
    const cabBalance = await cabClient.getCabBalance({
      address: account.address,
      token: supportedTokens.USDC[42161].token,
    })
    console.log("CAB balance:", cabBalance)
    if (cabBalance > 0) {
      break
    }
  }

  const repayTokens = [
    {
      address: supportedTokens.USDC[42161].token,
      chainId: 42161
    }
  ]

  // transfer 0.001 USDC to itself
  const calls = [
    {
      to: supportedTokens.USDC[8453].token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [account.address, BigInt(1000)]
      }),
      value: BigInt(0)
    }
  ]

  const { userOperation, repayTokensInfo, sponsorTokensInfo } =
    await cabClient.prepareUserOperationRequestCAB({
      account: cabClient.account,
      transactions: calls,
      repayTokens: repayTokens
    })

  console.log("userOperation:", userOperation)
  console.log("repayTokensInfo:", repayTokensInfo)
  console.log("sponsorTokensInfo:", sponsorTokensInfo)

  const userOpHash = await cabClient.sendUserOperationCAB({
    userOperation,
    repayTokens,
  })

  console.log("userOp hash:", userOpHash)

  const bundlerClient = cabClient.extend(bundlerActions(entryPoint))
  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  })

  console.log("userOp completed")
}

main()
