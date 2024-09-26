import "dotenv/config";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  KernelSmartAccount,
} from "@zerodev/sdk";
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless";
import {
  http,
  Hex,
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  Chain,
  Transport,
  Address,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { optimismSepolia, sepolia } from "viem/chains";
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { createKernelCABClient, supportedTokens } from "@zerodev/cab";
import { toMultiChainECDSAValidator } from "@zerodev/multi-chain-validator";
import {
  Caveat,
  createSessionAccount,
  Delegation,
  ROOT_AUTHORITY,
} from "@zerodev/session-account";
import { toCABPaymasterEnforcer } from "@zerodev/session-account/enforcers";
import { dmActionsEip7710 } from "@zerodev/session-account/clients";
import { ENTRYPOINT_ADDRESS_V07_TYPE } from "permissionless/types";

if (
  !process.env.SEPOLIA_BUNDLER_RPC ||
  !process.env.OPTIMISM_SEPOLIA_BUNDLER_RPC ||
  !process.env.PRIVATE_KEY ||
  !process.env.SEPOLIA_RPC_URL ||
  !process.env.OPTIMISM_SEPOLIA_RPC_URL ||
  !process.env.SEPOLIA_PAYMASTER_RPC ||
  !process.env.CAB_PAYMASTER_URL
) {
  throw new Error(
    "SEPOLIA_BUNDLER_RPC or OPTIMISM_SEPOLIA_BUNDLER_RPC or PRIVATE_KEY or SEPOLIA_RPC_URL or OPTIMISM_SEPOLIA_RPC_URL or SEPOLIA_PAYMASTER_RPC or CAB_PAYMASTER_URL is not set"
  );
}

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex);
const entryPoint = ENTRYPOINT_ADDRESS_V07;
const kernelVersion = KERNEL_V3_1;

const waitForUserInput = async () => {
  return new Promise<void>((resolve) => {
    process.stdin.once("data", () => {
      resolve();
    });
  });
};

const createKernelClient = async (chain: Chain) => {
  const bundlerRpc =
    chain.id === 11_155_111
      ? process.env.SEPOLIA_BUNDLER_RPC
      : process.env.OPTIMISM_SEPOLIA_BUNDLER_RPC_URL;
  const rpcUrl =
    chain.id === 11_155_111
      ? process.env.SEPOLIA_RPC_URL
      : process.env.OPTIMISM_SEPOLIA_RPC_URL;
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  const ecdsaValidator = await toMultiChainECDSAValidator(publicClient, {
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
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_PAYMASTER_RPC),
    entryPoint,
  });

  return createKernelAccountClient({
    account,
    entryPoint,
    chain,
    bundlerTransport: http(bundlerRpc, { timeout: 100_000 }),
    middleware: { sponsorUserOperation: paymasterClient.sponsorUserOperation },
  });
};

const enableCAB = async () => {
  const kernelClient = await createKernelClient(sepolia);
  const cabClient = createKernelCABClient(kernelClient, {
    transport: http(process.env.CAB_PAYMASTER_URL),
    entryPoint,
  });
  console.log("My account:", cabClient.account.address);

  console.log("Enabling CAB for optimismSepolia and sepolia...");
  await cabClient.enableCAB({
    tokens: [{ name: "6TEST", networks: [optimismSepolia.id, sepolia.id] }],
  });

  while (true) {
    console.log(
      `Deposit 6TEST (address: ${
        supportedTokens["6TEST"][sepolia.id].token
      }) on either optimismSepolia or sepolia.  Press Enter to check CAB.  Will proceed when CAB is greater than 0.`
    );
    await waitForUserInput();
    const cabBalance = await cabClient.getCabBalance({
      address: cabClient.account.address,
      token: "6TEST",
    });
    console.log("CAB balance:", cabBalance);
    if (cabBalance > 0) {
      break;
    }
  }
};

const installDMAndDelegate = async (
  caveats: Caveat[],
  sessionKeyAddress: Address
) => {
  console.log(
    "Installing the DelegationManager Module and delegating to session key..."
  );
  const kernelClient = await createKernelClient(sepolia);
  const kernelClientDM = kernelClient.extend(
    dmActionsEip7710<
      ENTRYPOINT_ADDRESS_V07_TYPE,
      Transport,
      Chain,
      KernelSmartAccount<ENTRYPOINT_ADDRESS_V07_TYPE, Transport, Chain>
    >()
  );

  const installDMAndDelegateTxHash = await kernelClientDM.installDMAndDelegate({
    caveats,
    sessionKeyAddress,
  });

  console.log(`installDMAndDelegateTxHash: ${installDMAndDelegateTxHash}`);
};

const main = async () => {
  await enableCAB();
  const kernelClient = await createKernelClient(sepolia);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  });
  const sessionKeySigner = privateKeyToAccount(generatePrivateKey());
  const cabCaveat = await toCABPaymasterEnforcer({
    accountAddress: kernelClient.account.address,
  });
  const caveats = [cabCaveat];

  const delegations: Delegation[] = [
    {
      delegator: kernelClient.account.address,
      delegate: sessionKeySigner.address,
      authority: ROOT_AUTHORITY,
      caveats,
      salt: BigInt(0),
      signature: "0x",
    },
  ];

  await installDMAndDelegate(caveats, sessionKeySigner.address);

  const sessionAccount = await createSessionAccount(publicClient, {
    entryPoint,
    sessionKeySigner,
    delegations,
    delegatorInitCode: await kernelClient.account.getInitCode(),
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_PAYMASTER_RPC),
    entryPoint,
  });

  const sessionAccountClient = await createKernelAccountClient({
    account: sessionAccount as unknown as KernelSmartAccount<
      ENTRYPOINT_ADDRESS_V07_TYPE,
      Transport,
      typeof sepolia
    >,
    entryPoint,
    chain: sepolia,
    bundlerTransport: http(process.env.SEPOLIA_BUNDLER_RPC, {
      timeout: 100_000,
    }),
    middleware: {
      sponsorUserOperation: paymasterClient.sponsorUserOperation,
    },
  });

  const sessionAccountClientDM = sessionAccountClient.extend(
    dmActionsEip7710<
      ENTRYPOINT_ADDRESS_V07_TYPE,
      Transport,
      typeof sepolia,
      KernelSmartAccount<ENTRYPOINT_ADDRESS_V07_TYPE, Transport, typeof sepolia>
    >()
  );

  const repayTokens = ["6TEST"];

  // transfer 0.001 USDC to itself
  const calls = [
    {
      to: supportedTokens["6TEST"][sepolia.id].token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [kernelClient.account.address, BigInt(1000)],
      }),
      value: BigInt(0),
    },
  ];

  console.log("Sending the transfer transaction with session account...");
  const userOpHash = await sessionAccountClient.sendUserOperation({
    userOperation: {
      callData: await sessionAccountClientDM.encodeCallDataWithCAB({
        calls,
        repayTokens,
      }),
    },
  });

  console.log("userOp hash:", userOpHash);

  const bundlerClient = sessionAccountClient.extend(bundlerActions(entryPoint));
  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log(`transactionHash: ${receipt.receipt.transactionHash}`);

  console.log("userOp completed");
  process.exit(0);
};

main();
