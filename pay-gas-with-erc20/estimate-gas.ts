import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  gasTokenAddresses,
} from "@zerodev/sdk";
import { ENTRYPOINT_ADDRESS_V06 } from "permissionless/utils";
import { createPublicClient, http, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
});

const signer = privateKeyToAccount(generatePrivateKey());
const entryPoint = ENTRYPOINT_ADDRESS_V06;

const main = async () => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    entryPoint,
    signer,
  });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
    },
  });

  const paymasterClient = createZeroDevPaymasterClient({
    entryPoint,
    chain: sepolia,
    transport: http(process.env.PAYMASTER_RPC),
  });

  const kernelClient = createKernelAccountClient({
    entryPoint,
    account,
    chain: sepolia,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    middleware: {
      sponsorUserOperation: paymasterClient.sponsorUserOperation,
    },
  });

  const userOperation = await kernelClient.prepareUserOperationRequest({
    userOperation: {
      callData: await account.encodeCallData({
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      }),
    },
    account,
  });

  const result = await paymasterClient.estimateGasInERC20({
    userOperation,
    gasTokenAddress: gasTokenAddresses[sepolia.id]["6TEST"],
  });

  console.log(`fee: ${result.amount} 6TEST`);
};

main();
