import "dotenv/config";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  gasTokenAddresses,
} from "@zerodev/sdk";
import { createPublicClient, http, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { getEntryPoint, KERNEL_V2_4 } from "@zerodev/sdk/constants";

const chain = sepolia;
const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
  chain,
});

const signer = privateKeyToAccount(generatePrivateKey());
const entryPoint = getEntryPoint("0.6");

const main = async () => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion: KERNEL_V2_4,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion: KERNEL_V2_4,
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    entryPoint,
    transport: http(process.env.PAYMASTER_RPC),
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    paymaster: paymasterClient,
    paymasterContext: { token: gasTokenAddresses[chain.id]["USDC"] },
  });

  const userOperation = await kernelClient.prepareUserOperation({
    callData: await account.encodeCalls([
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  });

  const result = await paymasterClient.estimateGasInERC20({
    userOperation,
    gasTokenAddress: gasTokenAddresses[chain.id]["USDC"],
    entryPoint: entryPoint.address,
  });

  console.log(`fee: ${result.amount} test tokens`);
};

main();
