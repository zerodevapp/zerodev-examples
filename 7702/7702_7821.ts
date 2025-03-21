import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  Hex,
  http,
  zeroAddress,
  Hash
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { eip7702Actions, erc7821Actions, verifyAuthorization } from "viem/experimental";
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
const bundlerRpc = `https://rpc.zerodev.app/api/v2/bundler/${projectId}`;
const paymasterRpc = `https://rpc.zerodev.app/api/v2/paymaster/${projectId}`;
const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_3_BETA;

// We use the Sepolia testnet here, but you can use any network that
// supports EIP-7702.
const chain = sepolia;

const publicClient = createPublicClient({
  transport: http(),
  chain,
});

const main = async () => {
  if (!process.env.PRIVATE_KEY || !process.env.PROJECT_ID) {
    throw new Error("PRIVATE_KEY and PROJECT_ID are required");
  }

  const signer = privateKeyToAccount(
    process.env.PRIVATE_KEY as Hex
  );
  console.log("EOA Address:", signer.address);

  const walletClient = createWalletClient({
    // Use any Viem-compatible EOA account
    account: signer,
    chain,
    transport: http(),
  }).extend(eip7702Actions()).extend(erc7821Actions());

  const authorization = await walletClient.signAuthorization({
    contractAddress:
      KernelVersionToAddressesMap[kernelVersion].accountImplementationAddress,
  });

  const hash = await walletClient.execute({
    address : signer.address,
    calls : [{
      to: "0x9775137314fE595c943712B0b336327dfa80aE8A",
      data : "0xdeadbeef",
      value : BigInt(1),
    },{
      to: "0x9775137314fE595c943712B0b336327dfa80aE8A",
      data : "0xcafecafe",
      value : BigInt(2),
    }],
    authorizationList : [authorization]
  })

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: hash
  });

  console.log("tx completed ,",`${chain.blockExplorers.default.url}/tx/${receipt.transactionHash}`);


  process.exit(0);
};

main();
