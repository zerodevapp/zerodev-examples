import "dotenv/config";
import { zeroAddress } from "viem";
import { getKernelClient } from "../utils";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";

async function main() {
  const kernelClient = await getKernelClient(ENTRYPOINT_ADDRESS_V07, KERNEL_V3_1);

  console.log("Account address:", kernelClient.account.address);

  const txnHash = await kernelClient.sendTransaction({
    to: zeroAddress, // use any address
    value: BigInt(0), // default to 0
    data: "0x", // default to 0x
  });

  console.log("Txn hash:", txnHash);
}

main();
