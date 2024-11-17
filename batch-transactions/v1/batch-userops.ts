import "dotenv/config";
import { http, zeroAddress } from "viem";
import {
  getKernelV1Account,
  getKernelV1AccountClient,
  getZeroDevPaymasterClient,
} from "../../utils";

async function main() {
  const kernelAccount = await getKernelV1Account();
  const paymaster = getZeroDevPaymasterClient();
  const kernelClient = await getKernelV1AccountClient({
    account: kernelAccount,
    paymaster: {
      getPaymasterData(userOperation) {
        return paymaster.sponsorUserOperation({ userOperation });
      },
    },
  });

  console.log("Account address:", kernelClient.account.address);

  const userOpHash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls([
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
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
