import "dotenv/config"
import {
  createKernelAccount,
  createKernelAccountClient,
} from "@zerodev/sdk"
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless"
import { http, Hex, createPublicClient, encodeFunctionData, erc20Abi, Chain } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { arbitrum, base } from "viem/chains"
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { createKernelCABClient, supportedTokens } from "@zerodev/cab"
import { toMultiChainECDSAValidator } from "@zerodev/multi-chain-validator"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"

if (
  !process.env.ARB_BUNDLER_RPC ||
  !process.env.BASE_BUNDLER_RPC ||
  !process.env.PRIVATE_KEY
) {
  throw new Error("ARB_BUNDLER_RPC or BASE_BUNDLER_RPC or PRIVATE_KEY is not set")
}

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
const entryPoint = ENTRYPOINT_ADDRESS_V07
const kernelVersion = KERNEL_V3_1

const waitForUserInput = async () => {
  return new Promise<void>(resolve => {
    process.stdin.once('data', () => {
      resolve()
    })
  })
}

const createCABClientForChain = async (chain: Chain) => {
  const bundlerRpc = chain.id === 42161 ? process.env.ARB_BUNDLER_RPC : process.env.BASE_BUNDLER_RPC
  const publicClient = createPublicClient({ chain, transport: http() })

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
  const kernelClient = createKernelAccountClient({
    account,
    entryPoint,
    chain,
    bundlerTransport: http(bundlerRpc) 
  })

  const cabClient = createKernelCABClient(kernelClient, {
    transport: http(process.env.CAB_PAYMASTER_URL)
  })

  return cabClient
}

const main = async () => {
  const arbCabClient = await createCABClientForChain(arbitrum)
  console.log("My account:", arbCabClient.account.address)

  console.log("Enabling CAB for arbitrum...")
  await arbCabClient.enableCAB({
    tokens: [{ name: "USDC", networks: [arbitrum.id] }]
  })

  const baseCabClient = await createCABClientForChain(base)
  console.log("Enabling CAB for base...")
  await baseCabClient.enableCAB({
    tokens: [{ name: "USDC", networks: [base.id] }]
  })

  while (true) {
    console.log('Deposit USDC on either Arbitrum or Base.  Press Enter to check CAB.  Will proceed when CAB is greater than 0.')
    await waitForUserInput()
    const cabBalance = await arbCabClient.getCabBalance({
      address: arbCabClient.account.address,
      token: 'USDC',
    })
    console.log("CAB balance:", cabBalance)
    if (cabBalance > 0) {
      break
    }
  }

  const repayTokens = ['USDC']

  // transfer 0.001 USDC to itself
  const calls = [
    {
      to: supportedTokens.USDC[base.id].token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [baseCabClient.account.address, BigInt(1000)]
      }),
      value: BigInt(0)
    }
  ]

  const { userOperation, repayTokensInfo, sponsorTokensInfo } =
    await baseCabClient.prepareUserOperationRequestCAB({
      calls: calls,
      repayTokens: repayTokens
    })

  console.log("userOperation:", userOperation)
  console.log("repayTokensInfo:", repayTokensInfo)
  console.log("sponsorTokensInfo:", sponsorTokensInfo)

  const userOpHash = await baseCabClient.sendUserOperationCAB({
    userOperation,
  })

  console.log("userOp hash:", userOpHash)

  const bundlerClient = baseCabClient.extend(bundlerActions(entryPoint))
  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  })

  console.log("userOp completed")
  process.exit(0)
}

main()
