import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  Hex,
  http,
  zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { odysseyTestnet } from "viem/chains";
import { eip7702Actions } from "viem/experimental";
import {
  getEntryPoint,
  KERNEL_V3_3_BETA,
  KernelVersionToAddressesMap,
} from "@zerodev/sdk/constants";
import { createKernelAccountClient } from "@zerodev/sdk";
import { getUserOperationGasPrice } from "@zerodev/sdk/actions";
import { createKernelAccount } from "@zerodev/sdk/accounts";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { createZeroDevPaymasterClient } from "@zerodev/sdk";

const projectId = process.env.PROJECT_ID;
const bundlerRpc = `https://rpc.zerodev.app/api/v2/bundler/${projectId}`;
const paymasterRpc = `https://rpc.zerodev.app/api/v2/paymaster/${projectId}`;
const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_3_BETA;
const chain = odysseyTestnet;
const publicClient = createPublicClient({
  transport: http(bundlerRpc),
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

    // We use the Odyssey testnet here, but you can use any network that
    // supports EIP-7702.
    chain,
    transport: http(),
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
    eip7702SponsorAccount: privateKeyToAccount(
      // NOTE: Don't worry about this private key, it's just for testing
      "0x688b84097239bc2bca41079d02fae599964a5844bc9e64f524206ad53a927bb9"
    ),
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

  const { receipt } = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log(
    "UserOp completed",
    `${chain.blockExplorers.default.url}/tx/${receipt.transactionHash}`
  );
};

main();
