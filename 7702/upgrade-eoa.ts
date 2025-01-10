import 'dotenv/config'
import { createWalletClient, http, publicActions } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { odysseyTestnet } from 'viem/chains'
import { eip7702Actions } from 'viem/experimental'

// This is the kernel delegation address for the Odyssey testnet
const KERNEL_DELEGATION_ADDRESS = '0x8AFA84cC510bE37e9D9D56da9a4Cd980FD4b19DC'

const main = async () => {
  const walletClient = createWalletClient({
    // Use any Viem-compatible EOA account
    account: privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`),

    // We use the Odyssey testnet here, but you can use any network that
    // supports EIP-7702.
    chain: odysseyTestnet,
    transport: http(),
  }).extend(eip7702Actions()).extend(publicActions)

  console.log('EOA address:', walletClient.account.address)

  const authorization = await walletClient.signAuthorization({
    contractAddress: KERNEL_DELEGATION_ADDRESS,
  })

  const hash = await walletClient.sendTransaction({
    to: walletClient.account.address,
    data: '0x',
    authorizationList: [authorization],
  })

  console.log('Transaction sent: ', hash)
  console.log('Waiting for confirmation...')

  const receipt = await walletClient.getTransactionReceipt({ hash })

  console.log(`EOA upgraded to Kernel.`)
}

main()
