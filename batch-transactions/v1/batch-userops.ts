import "dotenv/config";
import { http, zeroAddress } from "viem";
import {
  getKernelV1Account,
  getKernelV1AccountClient,
  getZeroDevPaymasterClient,
} from "../../utils";
import { ENTRYPOINT_ADDRESS_V06, bundlerActions } from "permissionless";
import { createPimlicoBundlerClient } from "permissionless/clients/pimlico";

async function main() {
  const kernelAccount = await getKernelV1Account();
  const kernelClient = await getKernelV1AccountClient({
    account: kernelAccount,
    middleware: {
      sponsorUserOperation: async ({ userOperation, entryPoint }) => {
        const zerodevPaymaster = getZeroDevPaymasterClient(entryPoint);
        return zerodevPaymaster.sponsorUserOperation({
          userOperation,
          entryPoint,
        });
      },
    },
  });

  console.log("Account address:", kernelClient.account.address);

  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await kernelClient.account.encodeCallData([
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
    },
  });

  console.log("UserOp hash:", userOpHash);
  console.log("Waiting for UserOp to complete...");

  const bundlerClient = kernelClient.extend(
    bundlerActions(ENTRYPOINT_ADDRESS_V06)
  );
  await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log("UserOp completed");
}

main();
