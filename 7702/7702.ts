import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  Hex,
  http,
  zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { eip7702Actions } from "viem/experimental";
import {
  getEntryPoint,
  KERNEL_V3_3_BETA,
  KernelVersionToAddressesMap,
} from "@zerodev/sdk/constants";
import { createKernelAccountClient } from "@zerodev/sdk";
import { createKernelAccount } from "@zerodev/sdk/accounts";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { createZeroDevPaymasterClient } from "@zerodev/sdk";

const projectId = process.env.PROJECT_ID;
const rpcUrl = process.env.RPC_URL;
const bundlerRpc = `https://rpc.zerodev.app/api/v2/bundler/${projectId}`; // For Holesky: `https://rpc.zerodev.app/api/v2/bundler/${projectId}?provider=ULTRA_RELAY`;
const paymasterRpc = `https://rpc.zerodev.app/api/v2/paymaster/${projectId}`; // For Holesky: `https://rpc.zerodev.app/api/v2/paymaster/${projectId}?provider=ULTRA_RELAY`;
const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_3_BETA;
const chain = sepolia;
const publicClient = createPublicClient({
  transport: http(rpcUrl),
  chain,
});

const main = async () => {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required");
  }

  const signer = privateKeyToAccount(
    generatePrivateKey() ?? (process.env.PRIVATE_KEY as Hex)
  );
  console.log("EOA Address:", signer.address);

  const walletClient = createWalletClient({
    // Use any Viem-compatible EOA account
    account: signer,

    // We use the Sepolia testnet here, but you can use any network that
    // supports EIP-7702.
    chain,
    transport: http(rpcUrl),
  }).extend(eip7702Actions());

  const authorization = await walletClient.signAuthorization({
    contractAddress:
      KernelVersionToAddressesMap[kernelVersion].accountImplementationAddress,
    delegate: true,
  });

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion,
    // Set the address of the smart account to the EOA address
    address: signer.address,
    // Set the 7702 authorization
    eip7702Auth: authorization,
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(paymasterRpc),
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(bundlerRpc),
    paymaster: {
      getPaymasterData: (userOperation) => {
        return paymasterClient.sponsorUserOperation({
          userOperation,
        })
      }
    },
    client: publicClient,
  });

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
  console.log("UserOp sent:", userOpHash);
  console.log("Waiting for UserOp to be completed...");

  const { receipt } = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log(
    "UserOp completed",
    `${chain.blockExplorers.default.url}/tx/${receipt.transactionHash}`
  );

  process.exit(0);
};

main();
