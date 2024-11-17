import "dotenv/config";
import { zeroAddress } from "viem";
import { getKernelClient } from "../utils";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";

const entryPoint = getEntryPoint("0.7");
async function main() {
  const kernelClient = await getKernelClient("0.7", KERNEL_V3_1);

  console.log("Account address:", kernelClient.account.address);

  const userOpHash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls([
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  });

  console.log("UserOp hash:", userOpHash);
  console.log("Waiting for UserOp to complete...");

  await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log("UserOp completed");
}

main();
