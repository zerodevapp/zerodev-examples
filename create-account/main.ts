import "dotenv/config"
import {
  createKernelAccount,
  createKernelAccountClient,
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { ENTRYPOINT_ADDRESS_V06, bundlerActions } from "permissionless"
import { http, Hex, createPublicClient, zeroAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { KERNEL_V2_4 } from "@zerodev/sdk/constants";
import { defineChain } from 'viem'

export const unrealTestnet = defineChain({
  id: 18233,
  name: 'Unreal Testnet',
  network: 'unrealTestnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Real Ether',
    symbol: 'reETH',
  },
  rpcUrls: {
    default: { http: ['https://rpc.unreal-orbit.gelato.digital'] },
    public: { http: ['https://rpc.unreal-orbit.gelato.digital'] },
  },
  blockExplorers: {
    default: {
      name: 'Block Explorer',
      url: 'https://unreal.blockscout.com/',
    },
  },
  testnet: true,
})

if (
  !process.env.BUNDLER_RPC ||
  !process.env.PAYMASTER_RPC ||
  !process.env.PRIVATE_KEY
) {
  throw new Error("BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY is not set")
}

const chain = unrealTestnet
const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
  chain
})

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
const entryPoint = ENTRYPOINT_ADDRESS_V06
const kernelVersion = KERNEL_V2_4

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
  })

  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await account.encodeCallData({
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      }),
      // @ts-ignore
      maxFeePerGas: "0x0",
      // @ts-ignore
      maxPriorityFeePerGas: "0x0",
    },
  })

  console.log("userOp hash:", userOpHash)

  const bundlerClient = kernelClient.extend(bundlerActions(entryPoint))
  const _receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
    pollingInterval: 500,
    timeout: 120000,
  })

  console.log("userOp completed")
}

main()
