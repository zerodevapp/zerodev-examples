import "dotenv/config";
import { zeroAddress } from "viem";
import { getKernelClient } from "../utils";
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless";

const entryPoint = ENTRYPOINT_ADDRESS_V07;
async function main() {
  const kernelClient = await getKernelClient(entryPoint, "0.3.1");

  console.log("Account address:", kernelClient.account.address);

  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await kernelClient.account.encodeCallData({
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      }),
    },
  });

  console.log("UserOp hash:", userOpHash);
  console.log("Waiting for UserOp to complete...");

  const bundlerClient = kernelClient.extend(bundlerActions(entryPoint));
  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log("UserOp completed");
}

main();
