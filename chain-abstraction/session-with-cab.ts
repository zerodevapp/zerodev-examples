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
import {
  cabPaymasterAddress,
  createKernelCABClient,
  invoiceManagerAddress,
  supportedTokens,
} from "@zerodev/cab";
import { toMultiChainECDSAValidator } from "@zerodev/multi-chain-validator";
import {
  Caveat,
  createSessionAccount,
  Delegation,
  ROOT_AUTHORITY,
} from "@zerodev/session-account";
import {
  CallType,
  ParamCondition,
  toAllowedParamsEnforcer,
  toCABPaymasterEnforcer,
} from "@zerodev/session-account/enforcers";
import { dmActionsEip7710 } from "@zerodev/session-account/clients";
import { ENTRYPOINT_ADDRESS_V07_TYPE } from "permissionless/types";
import { erc20SpenderAbi } from "./erc20SpenderAbi";

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

export const erc20SpenderAddress: Address =
  "0x7f9ae753D86c04a7C13004eaf2A97Fa95F61128F";
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

const getCabPermissions = async () => {
  const kernelClient = await createKernelClient(sepolia);
  const cabClient = createKernelCABClient(kernelClient, {
    transport: http(process.env.CAB_PAYMASTER_URL),
    entryPoint,
  });
  const { tokens: cabTokens } = await cabClient.getCabAllTokens({});
  return [
    ...cabTokens.map((tkn) => ({
      abi: erc20Abi,
      functionName: "transferFrom",
      target: tkn.address,
      callType: CallType.BATCH_CALL,
      args: [
        {
          condition: ParamCondition.EQUAL,
          value: cabPaymasterAddress,
        },
        {
          condition: ParamCondition.EQUAL,
          value: kernelClient.account.address,
        },
        null,
      ],
    })),
    {
      abi: [
        {
          type: "function",
          name: "createInvoice",
          inputs: [
            {
              name: "invoice",
              type: "tuple",
              internalType: "struct IInvoiceManager.InvoiceWithRepayTokens",
              components: [
                {
                  name: "account",
                  type: "address",
                  internalType: "address",
                },
                { name: "nonce", type: "uint256", internalType: "uint256" },
                {
                  name: "paymaster",
                  type: "address",
                  internalType: "address",
                },
                {
                  name: "sponsorChainId",
                  type: "uint256",
                  internalType: "uint256",
                },
                {
                  name: "repayTokenInfos",
                  type: "tuple[]",
                  internalType: "struct IInvoiceManager.RepayTokenInfo[]",
                  components: [
                    {
                      name: "vault",
                      type: "address",
                      internalType: "contract IVault",
                    },
                    {
                      name: "amount",
                      type: "uint256",
                      internalType: "uint256",
                    },
                    {
                      name: "chainId",
                      type: "uint256",
                      internalType: "uint256",
                    },
                  ],
                },
              ],
            },
          ],
          outputs: [],
          stateMutability: "payable",
        },
      ],
      functionName: "createInvoice",
      target: invoiceManagerAddress,
      callType: CallType.BATCH_CALL,
      args: [null],
    },
  ];
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
  const allowedParamsCaveat = toAllowedParamsEnforcer({
    permissions: [
      // @ts-expect-error
      ...(await getCabPermissions()),
      {
        // @ts-expect-error
        abi: erc20Abi,
        target: supportedTokens["6TEST"][sepolia.id].token,
        // @ts-expect-error
        functionName: "approve",
        callType: CallType.BATCH_CALL,
        args: [
          // @ts-expect-error
          {
            condition: ParamCondition.EQUAL,
            value: erc20SpenderAddress,
          },
          // @ts-expect-error
          null,
        ],
      },
      {
        // @ts-expect-error: Types can't infer two abis at the same time, ideally can put all the required functions in a single abi to avoid error
        abi: erc20SpenderAbi,
        target: erc20SpenderAddress,
        // @ts-expect-error
        functionName: "spendAllowance",
        callType: CallType.BATCH_CALL,
        args: [
          // @ts-expect-error
          {
            condition: ParamCondition.EQUAL,
            value: supportedTokens["6TEST"][sepolia.id].token,
          },
          // @ts-expect-error
          {
            condition: ParamCondition.LESS_THAN_OR_EQUAL,
            value: BigInt(1000),
          },
        ],
      },
    ],
  });
  const caveats = [cabCaveat, allowedParamsCaveat];

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

  // transfer 0.001 6TEST to itself
  const calls = [
    {
      to: supportedTokens["6TEST"][sepolia.id].token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [erc20SpenderAddress, BigInt(1000)],
      }),
      value: BigInt(0),
    },
    {
      to: erc20SpenderAddress,
      data: encodeFunctionData({
        abi: erc20SpenderAbi,
        functionName: "spendAllowance",
        args: [supportedTokens["6TEST"][sepolia.id].token, BigInt(1000)],
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
