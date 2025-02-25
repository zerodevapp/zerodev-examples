/**
 * This example uses Viem to update an EOA to a Kernel account.
 */

import 'dotenv/config'
import { createWalletClient, Hex, http, publicActions, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { odysseyTestnet } from 'viem/chains'
import { signAuthorization } from 'viem/experimental'

// This is the kernel delegation address for the Odyssey testnet
const KERNEL_DELEGATION_ADDRESS = "0x94F097E1ebEB4ecA3AAE54cabb08905B239A7D27"

const main = async () => {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required")
  }

  const account = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
  console.log("Owner Address:", account.address)

  // Create wallet client with the primary account
  const wallet = createWalletClient({
    account,
    chain: odysseyTestnet,
    transport: http(),
  }).extend(publicActions)

  console.log('Using account address:', wallet.account.address)

  const authorization = await signAuthorization(wallet, {
    account,
    contractAddress: KERNEL_DELEGATION_ADDRESS,
  })

  // Send an empty transaction using the primary account
  const hash = await wallet.sendTransaction({
    to: zeroAddress,
    value: BigInt(0),
    account: wallet.account,
    authorizationList: [authorization]
  })

  console.log('Transaction sent: ', hash)
  console.log('Waiting for confirmation...')

  // wait a few seconds before checking the receipt
  // seems to be a bug with the testnet
  await new Promise(resolve => setTimeout(resolve, 3000))

  await wallet.getTransactionReceipt({ hash })

  console.log(`Empty transaction sent successfully.`)
}

main()
