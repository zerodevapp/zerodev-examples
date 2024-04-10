import "dotenv/config";
import { getKernelClient } from "../utils";
import { GreeterAbi, GreeterBytecode } from "./Greeter";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";

async function main() {
  const kernelClient = await getKernelClient(ENTRYPOINT_ADDRESS_V07);

  console.log("Account address:", kernelClient.account.address);

  const txnHash = await kernelClient.deployContract({
    abi: GreeterAbi,
    bytecode: GreeterBytecode,
  });

  console.log("Txn hash:", txnHash);
}

main();
