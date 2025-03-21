import * as dotenv from "dotenv"
import { Chain, createPublicClient, http, formatUnits, parseUnits, type Hex, type ByteArray } from "viem"
import { base } from "viem/chains"
import { 
  address, 
  getBase58Encoder, 
  createKeyPairSignerFromBytes, 
  type Address as SolanaAddress, 
  createSolanaRpc, 
  getTransactionDecoder, 
  getBase64EncodedWireTransaction, 
  setTransactionMessageFeePayer, 
  getCompiledTransactionMessageEncoder, 
  compileTransactionMessage, 
  appendTransactionMessageInstructions, 
  setTransactionMessageLifetimeUsingBlockhash, 
  createTransactionMessage, 
  pipe } from "@solana/kit"
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token"
import { createIntentClient, INTENT_V0_3, installIntentExecutor } from "@konfeature/zd-intent"
import { KERNEL_V3_2 } from "@zerodev/sdk/constants"
import { getEntryPoint } from "@zerodev/sdk/constants"
import { toMultiChainECDSAValidator } from "@zerodev/multi-chain-ecdsa-validator"
import { createKernelAccount } from "@zerodev/sdk"
import { privateKeyToAccount } from "viem/accounts"

dotenv.config()

if (!process.env.PRIVATE_KEY || !process.env.SOLANA_PRIVATE_KEY || !process.env.SOLANA_RECIPIENT) {
  throw new Error("PRIVATE_KEY, SOLANA_PRIVATE_KEY and SOLANA_RECIPIENT must be set")
}

const timeout = 100_000;

const chain = base;

const evmPrivateKey = process.env.PRIVATE_KEY as Hex;
const solanaPrivateKey = getBase58Encoder().encode(process.env.SOLANA_PRIVATE_KEY as Hex);
const solanaRecipient = process.env.SOLANA_RECIPIENT as string;
const bundlerRpc = process.env.BUNDLER_RPC as string;
const intentRpc = process.env.INTENT_RPC as string;
const relayerRpc = process.env.RELAYER_RPC as string;

// evm signer account
const eoaAccount = privateKeyToAccount(evmPrivateKey);

// New solana/kit signer
const solanaSignerAsync = createKeyPairSignerFromBytes(solanaPrivateKey)

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

const waitForUserInput = async () => {
  return new Promise<void>((resolve) => {
    process.stdin.once("data", () => {
      resolve();
    });
  });
};

/**
 * Build the zerodev intent client with a `solana` extension
 */
async function createIntentClinet(chain: Chain) {
  // set kernel and entryPoint version
  const entryPoint = getEntryPoint("0.7");
  const kernelVersion = KERNEL_V3_2;

  // create ecdsa validator
  const ecdsaValidator = await toMultiChainECDSAValidator(publicClient, {
    signer: eoaAccount,
    kernelVersion,
    entryPoint,
  });

  // create a kernel account with intent executor plugin
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    kernelVersion,
    entryPoint,
    initConfig: [installIntentExecutor(INTENT_V0_3)],
  });

  const solanaSigner = await solanaSignerAsync;

  // the cab client can be used to send normal userOp and cross-chain cab tx
  return createIntentClient({
    account: kernelAccount,
    chain,
    bundlerTransport: http(bundlerRpc, { timeout }),
    version: INTENT_V0_3,
    // beta only
    relayerTransport: http(relayerRpc, { timeout }),
    intentTransport: http(intentRpc, { timeout }),
    // solana specific parameters
    solana: {
      address: solanaSigner.address,
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      signTransaction: async (transaction: ByteArray) => {
        const decoded = getTransactionDecoder().decode(transaction)
        const [signatures] = await solanaSigner.signTransactions([decoded])
        const newTransaction = {
          ...decoded,
          signatures: Object.freeze({
            ...decoded.signatures,
            ...signatures
          }),
        }
        return getBase64EncodedWireTransaction(newTransaction);
      },
    },
  });
}

// transfer usdc to recipient
const getInstructions = async ({
  token,
  amount,
  decimal,
  recipient,
}: {
  token: SolanaAddress,
  amount: bigint,
  decimal: number,
  recipient: SolanaAddress,
}) => {
  // New solana/kit signer
  const solanaSigner = await solanaSignerAsync;

  // construct instructions
  const [sourceAssociatedTokenAddress] = await findAssociatedTokenPda({
    mint: token,
    owner: solanaSigner.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [destinationAssociatedTokenAddress] = await findAssociatedTokenPda({
    mint: token,
    owner: recipient,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const createAssociatedTokenInstruction = await getCreateAssociatedTokenIdempotentInstructionAsync(
    {
      mint: token,
      owner: recipient,
      payer: solanaSigner,
    },
  );
  const transferInstruction = getTransferCheckedInstruction(
    {
      source: sourceAssociatedTokenAddress,
      mint: token,
      destination: destinationAssociatedTokenAddress,
      authority: solanaSigner.address,
      amount: amount,
      decimals: decimal,
    },
    {
      programAddress: TOKEN_PROGRAM_ADDRESS,
    },
  );

  const instructions = [createAssociatedTokenInstruction, transferInstruction]
  return instructions
}

async function main() {
  const intentClient = await createIntentClinet(chain)
  const solanaSigner = await solanaSignerAsync;

  // output token and chainId
  const decimal = 6;
  const outputChainId = 792703809; // solana
  const outputToken = address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC on solana
  const outputAmount = parseUnits("0.5", decimal)
  const minDepositAmount = parseUnits("0.1", decimal)

  // executed instructions, transfer usdc to recipient
  const instructions = await getInstructions({
    token: outputToken,
    amount: outputAmount,
    decimal: decimal,
    recipient: address(solanaRecipient),
  });

  // get cab to make sure the balance is enough
  while (true) {
    console.log(
      `Please deposit ${formatUnits(minDepositAmount, decimal)} USDC to ${intentClient.account.address} on ${chain.name}.`
    );
    await waitForUserInput();
    const cab = await intentClient.getCAB({
      networks: [base.id],
      tokenTickers: ["USDC"],
    });

    if (BigInt(cab.tokens[0].amount) >= minDepositAmount) {
      break;
    }
    console.log(
      `Insufficient USDC balance: ${formatUnits(
        BigInt(cab.tokens[0].amount),
        decimal
      )}. Please deposit at least ${formatUnits(minDepositAmount, decimal)} USDC.`
    );
  }

  // Prepare the transaction we want to execute with the intent client
  const solanaRpc = createSolanaRpc('https://api.mainnet-beta.solana.com')
  const { value: latestBlockhash } = await solanaRpc
    .getLatestBlockhash()
    .send();
  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (message) =>
      setTransactionMessageFeePayer(solanaSigner.address, message),
    (message) =>
      setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message),
    (message) =>
      appendTransactionMessageInstructions(instructions, message),
  );
  const compiledTransactionMessage =
    compileTransactionMessage(transactionMessage);
  const encodedTransactionMessage =
    getCompiledTransactionMessageEncoder().encode(
      compiledTransactionMessage,
    );


  // send evm -> solana intent
  console.log("start sending intent evm -> solana");
  const result = await intentClient.sendUserIntent({
    inputTokens: [
      {
        chainId: base.id,
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on base
      }
    ],
    outputTokens: [
      {
        chainId: outputChainId,
        address: outputToken,
        amount: outputAmount,
      },
    ],
    solTransaction: encodedTransactionMessage,
  });
  console.log(`successfully send cab tx, intentId: ${result.outputUiHash.uiHash}`);

  // wait for the intent to be opened on the input chains
  await Promise.all(
    result.inputsUiHash.map(async (data) => {
      const openReceipts = await intentClient.waitForUserIntentOpenReceipt({
        uiHash: data.uiHash,
      });
      if (openReceipts?.receipt?.transactionHash) {
        console.log(`intent open on chain ${openReceipts?.openChainId} txHash: ${openReceipts?.receipt?.transactionHash}`);
      }
    })
  );

  // TODO: wait for execution receipt
  const receipt = await intentClient.waitForUserIntentExecutionReceipt({
    uiHash: result.outputUiHash.uiHash,
  });
  console.log(
    `intent executed on chain: ${receipt?.executionChainId}`,
    receipt
  );

  process.exit(0);
}

main()