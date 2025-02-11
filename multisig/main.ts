import "dotenv/config";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { http, createPublicClient, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import {
  createWeightedKernelAccountClient,
  createWeightedValidator,
  toECDSASigner,
  type WeightedSigner,
} from "@zerodev/weighted-validator";

if (!process.env.BUNDLER_RPC || !process.env.PAYMASTER_RPC) {
  throw new Error("BUNDLER_RPC or PAYMASTER_RPC is not set");
}

const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
  chain: sepolia,
});

// Generate or use existing private keys for signers
const pKey1 = generatePrivateKey()
const pKey2 = generatePrivateKey()

const eoaAccount1 = privateKeyToAccount(pKey1)
const eoaAccount2 = privateKeyToAccount(pKey2)

const entryPoint = getEntryPoint("0.7");

const main = async () => {
  // Create ECDSA signers
  const ecdsaSigner1 = await toECDSASigner({ signer: eoaAccount1 })
  const ecdsaSigner2 = await toECDSASigner({ signer: eoaAccount2 })

  // Helper function to create client for each signer
  const createWeightedAccountClient = async (signer: WeightedSigner) => {
    const multiSigValidator = await createWeightedValidator(publicClient, {
      entryPoint,
      signer,
      config: {
        threshold: 100,
        signers: [
          { publicKey: ecdsaSigner1.account.address, weight: 50 },
          { publicKey: ecdsaSigner2.account.address, weight: 50 }
        ]
      },
      kernelVersion: KERNEL_V3_1
    });

    const account = await createKernelAccount(publicClient, {
      entryPoint,
      plugins: {
        sudo: multiSigValidator
      },
      kernelVersion: KERNEL_V3_1
    });

    console.log(`Account address: ${account.address}`);

    const paymasterClient = createZeroDevPaymasterClient({
      chain: sepolia,
      transport: http(process.env.PAYMASTER_RPC),
    });

    return createWeightedKernelAccountClient({
      account,
      chain: sepolia,
      bundlerTransport: http(process.env.BUNDLER_RPC),
      paymaster: paymasterClient
    });
  };

  // Create clients for both signers
  const client1 = await createWeightedAccountClient(ecdsaSigner1);
  const client2 = await createWeightedAccountClient(ecdsaSigner2);

  // Prepare the UserOperation that needs to be signed
  const callData = await client1.account.encodeCalls([
    {
      to: zeroAddress,
      data: "0x",
      value: BigInt(0)
    }
  ]);

  // Get approval from first signer
  const signature1 = await client1.approveUserOperation({
    callData
  });

  // Get approval from second signer
  const signature2 = await client2.approveUserOperation({
    callData
  });

  // Send the transaction with both signatures
  const userOpHash = await client2.sendUserOperationWithSignatures({
    callData,
    signatures: [signature1, signature2]
  });

  console.log("UserOperation hash:", userOpHash);

  const receipt = await client2.waitForUserOperationReceipt({
    hash: userOpHash
  });

  console.log("Transaction hash:", receipt.receipt.transactionHash);
  console.log("UserOperation completed!");
};

main().catch(console.error); 