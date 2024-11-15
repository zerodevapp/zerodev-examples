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
    paymaster,
  });

  console.log("Account address:", kernelClient.account.address);

  const txnHash = await kernelClient.sendTransaction({
    calls: [
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
