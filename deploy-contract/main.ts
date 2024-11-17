import "dotenv/config";
import { getKernelClient } from "../utils";
import { GreeterAbi, GreeterBytecode } from "./Greeter";
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";

async function main() {
  const kernelClient = await getKernelClient("0.7", KERNEL_V3_1);

  console.log("Account address:", kernelClient.account.address);

  const txnHash = await kernelClient.sendTransaction({
    callData: await kernelClient.account.encodeDeployCallData({
      abi: GreeterAbi,
      bytecode: GreeterBytecode,
    }),
  });

  console.log("Txn hash:", txnHash);
}

main();
