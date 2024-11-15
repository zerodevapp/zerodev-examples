import "dotenv/config";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { createKernelAccount, verifyEIP6492Signature } from "@zerodev/sdk";
import { createPublicClient, hashMessage, Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";

const entryPoint = getEntryPoint("0.7");

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  throw new Error("PRIVATE_KEY is not set");
}

const signer = privateKeyToAccount(privateKey as Hex);

const kernelVersion = KERNEL_V3_1;

const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
});

async function main() {
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
  });

  console.log("Account address:", account.address);

  const signature = await account.signMessage({
    message: "hello world",
  });

  console.log(
    await verifyEIP6492Signature({
      signer: account.address, // your smart account address
      hash: hashMessage("hello world"),
      signature: signature,
      client: publicClient,
    })
  );
}

main();
