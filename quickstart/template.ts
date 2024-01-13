import "dotenv/config"
import { Hex, parseAbi } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const ZERODEV_PROJECT_ID = ''

const zeroDevProjectId = ZERODEV_PROJECT_ID || process.env.ZERODEV_PROJECT_ID
if (!zeroDevProjectId) {
  throw new Error("ZERODEV_PROJECT_ID is not set")
}

const privateKey = process.env.PRIVATE_KEY || generatePrivateKey()
const signer = privateKeyToAccount(privateKey as Hex)

// The NFT contract we will be interacting with
const contractAddress = '0x34bE7f35132E97915633BC1fc020364EA5134863'
const contractABI = parseAbi([
  'function mint(address _to) public',
  'function balanceOf(address owner) external view returns (uint256 balance)'
])

const main = async () => {
}

main()
