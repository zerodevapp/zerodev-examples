import "dotenv/config"
import { getKernelClient } from "../utils"
import { GreeterAbi, GreeterBytecode } from "./Greeter"

async function main() {
  const kernelClient = await getKernelClient()

  console.log("Account address:", kernelClient.account.address)

  const txnHash = await kernelClient.deployContract({
    abi: GreeterAbi,
    bytecode: GreeterBytecode,
  })

  console.log("Txn hash:", txnHash)
}

main()