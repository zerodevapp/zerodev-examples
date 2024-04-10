import "dotenv/config";
import { http, zeroAddress } from "viem";
import {
  getKernelV1Account,
  getKernelV1AccountClient,
  getZeroDevPaymasterClient,
} from "../../utils";
import { createPimlicoBundlerClient } from "permissionless/clients/pimlico";
import { ENTRYPOINT_ADDRESS_V06 } from "permissionless";

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

  const txnHash = await kernelClient.sendTransactions({
    transactions: [
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
    ],
  });

  console.log("Txn hash:", txnHash);
}

main();
