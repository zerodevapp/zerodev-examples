import 'dotenv/config'
import { concat, createWalletClient, Hex, http, publicActions, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { odysseyTestnet } from 'viem/chains'
import { signAuthorization } from 'viem/experimental'
import kernelV3ImplementationAbi from './abi/kernelV3Implementation'
import { writeContract } from 'viem/actions'

// This is the kernel delegation address for the Odyssey testnet
// const KERNEL_DELEGATION_ADDRESS = '0x8AFA84cC510bE37e9D9D56da9a4Cd980FD4b19DC'
const KERNEL_DELEGATION_ADDRESS = "0x94F097E1ebEB4ecA3AAE54cabb08905B239A7D27"
const ECDSA_VALIDATOR = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57"

const main = async () => {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required")
  }

  const account = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
  console.log("Owner Address:", account.address)

  if (!process.env.SPONSOR_PRIVATE_KEY) {
    throw new Error("SPONSOR_PRIVATE_KEY is required")
  }

  const sponsorWallet = createWalletClient({
    // Use any Viem-compatible EOA account
    account: privateKeyToAccount(process.env.SPONSOR_PRIVATE_KEY as Hex),

    // We use the Odyssey testnet here, but you can use any network that
    // supports EIP-7702.
    chain: odysseyTestnet,
    transport: http(),
  }).extend(publicActions)

  console.log('Sponsor EOA address:', sponsorWallet.account.address)

  const authorization = await signAuthorization(sponsorWallet, {
    account,
    contractAddress: KERNEL_DELEGATION_ADDRESS,
    delegate: sponsorWallet.account.address,
  })

  const hash = await writeContract(sponsorWallet, {
    address: account.address,
    abi: kernelV3ImplementationAbi,
    functionName: "initialize",
    args: [
      concat(["0x01", ECDSA_VALIDATOR]),
      zeroAddress,
      account.address,
      "0x",
    ],
    account: sponsorWallet.account,
    authorizationList: [authorization]
  })

  console.log('Transaction sent: ', hash)
  console.log('Waiting for confirmation...')

  // wait a few seconds before checking the receipt
  await new Promise(resolve => setTimeout(resolve, 3000))

  const receipt = await sponsorWallet.getTransactionReceipt({ hash })

  console.log(`EOA upgraded to Kernel.`)
}

main()
