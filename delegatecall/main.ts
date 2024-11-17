import "dotenv/config";
import { getKernelClient } from "../utils";
import { zeroAddress } from "viem";
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";

async function main() {
  const kernelClient = await getKernelClient("0.7", KERNEL_V3_1);

  console.log("Account address:", kernelClient.account.address);

  const userOpHash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls(
      [
        {
          to: zeroAddress,
          value: BigInt(0),
          data: "0x",
        },
      ],
      "delegatecall"
    ),
  });

  console.log("UserOp hash:", userOpHash);
  const receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log(
    `https://sepolia.etherscan.io/tx/${receipt.receipt.transactionHash}`
  );
}

main();
