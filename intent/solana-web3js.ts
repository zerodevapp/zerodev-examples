import * as dotenv from "dotenv"
import { Chain, createPublicClient, http, formatUnits, parseUnits, type Hex, type ByteArray } from "viem"
import { base } from "viem/chains"
import { address, getBase58Encoder, type Base64EncodedWireTransaction, type Address as SolanaAddress } from "@solana/kit"
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
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import { createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction, getOrCreateAssociatedTokenAccount } from "@solana/spl-token"

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

// Legacy solana signer
const solanaSignerLegacy = Keypair.fromSecretKey(solanaPrivateKey as Uint8Array)

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

  // the cab client can be used to send normal userOp and cross-chain cab tx
  const intentClient = createIntentClient({
    account: kernelAccount,
    chain,
    bundlerTransport: http(bundlerRpc, { timeout }),
    version: INTENT_V0_3,
    // beta only
    relayerTransport: http(relayerRpc, { timeout }),
    intentTransport: http(intentRpc, { timeout }),
    // solana tx adapter
    solana: {
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      address: solanaSignerLegacy.publicKey.toBase58() as unknown as SolanaAddress,
      signTransaction: async (rawTransaction: ByteArray) => {
        // Map the transaction to the solana transaction format and sign it
        const transaction = Transaction.from(rawTransaction);
        transaction.sign(solanaSignerLegacy)

        // serialize the transaction and return the base64 encoded string 
        //  todo: here some config could be pass to skip some checks
        const buffer = transaction.serialize();
        return Buffer.from(buffer).toString('base64') as Base64EncodedWireTransaction;
      },
    },
  });
  return intentClient;
}

// transfer usdc to recipient
// todo: missing the instruction for the `getCreateAssociatedTokenIdempotentInstructionAsync`
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
  const connection = new Connection("https://api.mainnet-beta.solana.com")

  // Get the src and dst account
  const sourceAccount = await getOrCreateAssociatedTokenAccount(
    connection, 
    solanaSignerLegacy,
    new PublicKey(token),
    solanaSignerLegacy.publicKey
  );
  const destinationAccount = await getOrCreateAssociatedTokenAccount(
    connection, 
    solanaSignerLegacy,
    new PublicKey(token),
    new PublicKey(recipient)
  );

  // Create the transfer instruction
  const transferInstruction = createTransferInstruction(
    sourceAccount.address,
    destinationAccount.address,
    solanaSignerLegacy.publicKey,
    amount
  );

  return [transferInstruction];
}

async function main() {
  const intentClient = await createIntentClinet(chain)

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
  })

  // Build the transacton
  const transaction = new Transaction();
  for (const instruction of instructions) {
    transaction.add(instruction);
  }

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

  // Add the block infos to the transaction
  const connection = new Connection("https://api.mainnet-beta.solana.com")
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = latestBlockhash.blockhash;

  // todo: it have a check on the fee payer, so we put a placeholder one that will be replaced by the actual fee payer
  transaction.feePayer = solanaSignerLegacy.publicKey;

  // Serialize the transaction (we don't sign it yet since we will add fee payer and stuff)
  transaction.verifySignatures(false)
  const buffer = transaction.compileMessage().serialize();
  const encodedTransaction = new Uint8Array(buffer);

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
        amount: parseUnits("2.05", decimal),
      },
    ],
    solTransaction: encodedTransaction,
  });
  console.log(`succesfully send cab tx, intentId: ${result.outputUiHash.uiHash}`);
 
  // todo: e2e fcked up with payment token on relayer side
  

  // wait for the intent to be opened on the input chains
  await Promise.all(
    result.inputsUiHash.map(async (data) => {
      const openReceipts =  await intentClient.waitForUserIntentOpenReceipt({
        uiHash: data.uiHash,
      });
      console.log(`intent open on chain ${openReceipts?.openChainId} txHash: ${openReceipts?.receipt?.transactionHash}`);
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