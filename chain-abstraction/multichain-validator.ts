// 🔗🔗 Check the example here: https://github.com/zerodevapp/zerodev-examples/blob/v5.3.x/chain-abstraction/multichain-validator.ts

// import "dotenv/config"
// import {
//   createKernelAccount,
//   createKernelAccountClient,
// } from "@zerodev/sdk"
// import { http, Hex, createPublicClient, encodeFunctionData, erc20Abi, Chain } from "viem"
// import { privateKeyToAccount } from "viem/accounts"
// import { arbitrum, base } from "viem/chains"
// import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
// import { createKernelCABClient, supportedTokens } from "@zerodev/cab"
// import { toMultiChainECDSAValidator } from "@zerodev/multi-chain-validator"

// if (
//   !process.env.ARB_BUNDLER_RPC ||
//   !process.env.BASE_BUNDLER_RPC ||
//   !process.env.PRIVATE_KEY
// ) {
//   throw new Error("ARB_BUNDLER_RPC or BASE_BUNDLER_RPC or PRIVATE_KEY is not set")
// }

// const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
// const entryPoint = ENTRYPOINT_ADDRESS_V07
// const kernelVersion = KERNEL_V3_1

// const waitForUserInput = async () => {
//   return new Promise<void>(resolve => {
//     process.stdin.once('data', () => {
//       resolve()
//     })
//   })
// }

// const createCABClientForChain = async (chain: Chain) => {
//   const bundlerRpc = chain.id === 42161 ? process.env.ARB_BUNDLER_RPC : process.env.BASE_BUNDLER_RPC
//   const publicClient = createPublicClient({ chain, transport: http() })

//   const ecdsaValidator = await toMultiChainECDSAValidator(publicClient, {
//     signer,
//     entryPoint,
//     kernelVersion,
//   })

//   const account = await createKernelAccount(publicClient, {
//     plugins: {
//       sudo: ecdsaValidator,
//     },
//     entryPoint,
//     kernelVersion,
//   })

//   const kernelClient = createKernelAccountClient({
//     account,
//     entryPoint,
//     chain,
//     bundlerTransport: http(bundlerRpc) 
//   })

//   const cabClient = createKernelCABClient(kernelClient, {
//     transport: http(process.env.CAB_PAYMASTER_URL),
//     entryPoint
//   })

//   return cabClient
// }

// const main = async () => {
//   const cabClient = await createCABClientForChain(base)
//   console.log("My account:", cabClient.account.address)

//   console.log("Enabling CAB for arbitrum and base...")
//   await cabClient.enableCAB({
//     tokens: [{ name: "USDC", networks: [arbitrum.id, base.id] }]
//   })

//   while (true) {
//     console.log('Deposit USDC on either Arbitrum or Base.  Press Enter to check CAB.  Will proceed when CAB is greater than 0.')
//     await waitForUserInput()
//     const cabBalance = await cabClient.getCabBalance({
//       address: cabClient.account.address,
//       token: 'USDC',
//     })
//     console.log("CAB balance:", cabBalance)
//     if (cabBalance > 0) {
//       break
//     }
//   }

//   const repayTokens = ['USDC']

//   // transfer 0.001 USDC to itself
//   const calls = [
//     {
//       to: supportedTokens.USDC[base.id].token,
//       data: encodeFunctionData({
//         abi: erc20Abi,
//         functionName: "transfer",
//         args: [cabClient.account.address, BigInt(1000)]
//       }),
//       value: BigInt(0)
//     }
//   ]

//   const { userOperation, repayTokensInfo, sponsorTokensInfo } =
//     await cabClient.prepareUserOperationRequestCAB({
//       calls: calls,
//       repayTokens: repayTokens
//     })

//   console.log("userOperation:", userOperation)
//   console.log("repayTokensInfo:", repayTokensInfo)
//   console.log("sponsorTokensInfo:", sponsorTokensInfo)

//   const userOpHash = await cabClient.sendUserOperationCAB({
//     userOperation,
//   })

//   console.log("userOp hash:", userOpHash)

//   const bundlerClient = cabClient.extend(bundlerActions(entryPoint))
//   await bundlerClient.waitForUserOperationReceipt({
//     hash: userOpHash,
//   })

//   console.log("userOp completed")
//   process.exit(0)
// }

// main()
