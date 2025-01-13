import 'dotenv/config'
import { createPublicClient, createWalletClient, Hex, http, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { odysseyTestnet } from 'viem/chains'
import { eip7702Actions } from 'viem/experimental'
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants'
import { createKernelAccountClient } from '@zerodev/sdk'
import { getUserOperationGasPrice } from '@zerodev/sdk/actions'
import { createKernelAccount } from '@zerodev/sdk/accounts'
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import { createZeroDevPaymasterClient, KERNEL_7702_DELEGATION_ADDRESS } from '@zerodev/sdk'

const entryPoint = getEntryPoint("0.7")
const kernelVersion = KERNEL_V3_1
const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
  chain: odysseyTestnet,
});

const main = async () => {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required")
  }

  const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
  console.log("EOA Address:", signer.address)

  const walletClient = createWalletClient({
    // Use any Viem-compatible EOA account
    account: signer,

    // We use the Odyssey testnet here, but you can use any network that
    // supports EIP-7702.
    chain: odysseyTestnet,
    transport: http(),
  }).extend(eip7702Actions())

  const authorization = await walletClient.signAuthorization({
    contractAddress: KERNEL_7702_DELEGATION_ADDRESS,
    delegate: true,
  })

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion,
    // Set the address of the smart account to the EOA address
    address: signer.address,
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain: odysseyTestnet,
    transport: http(process.env.PAYMASTER_RPC),
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain: odysseyTestnet,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    paymaster: paymasterClient,
    client: publicClient,
    userOperation: {
      estimateFeesPerGas: async ({ bundlerClient }) => {
        return getUserOperationGasPrice(bundlerClient);
      },
    },
    // Set the 7702 authorization
    eip7702Auth: authorization,
  });

  const userOpHash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls([
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  })

  await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  })
  console.log("UserOp completed")
}

main()
