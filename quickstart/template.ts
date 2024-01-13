import "dotenv/config"
import { parseAbi } from "viem"

if (!process.env.ZERODEV_PROJECT_ID) {
  throw new Error("ZERODEV_PROJECT_ID is not set")
}

// The NFT contract we will be interacting with
const contractAddress = '0x34bE7f35132E97915633BC1fc020364EA5134863'
const contractABI = parseAbi([
  'function mint(address _to) public',
  'function balanceOf(address owner) external view returns (uint256 balance)'
])

const main = async () => {
}

main()
