import "dotenv/config"
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless"
import {
  http,
  Hex,
  createPublicClient,
  parseAbi,
  encodeFunctionData,
  zeroAddress,
} from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { toECDSASigner } from "@zerodev/permissions/signers"
import {
  ModularSigner,
  deserializePermissionAccount,
  serializePermissionAccount,
  toPermissionValidator,
} from "@zerodev/permissions"
import { ParamCondition, toCallPolicy, toSudoPolicy } from "@zerodev/permissions/policies"

if (
  !process.env.BUNDLER_RPC ||
  !process.env.PAYMASTER_RPC ||
  !process.env.PRIVATE_KEY
) {
  throw new Error("BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY is not set")
}

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.BUNDLER_RPC),
})

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)

const entryPoint = ENTRYPOINT_ADDRESS_V07
const createSessionKey = async (
  sessionKeySigner: ModularSigner,
  sessionPrivateKey: Hex
) => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    entryPoint,
    signer,
  })

  const masterAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
    },
  })
  console.log("Account address:", masterAccount.address)

  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint,
    signer: sessionKeySigner,
    policies: [
      // In this example, we are just using a sudo policy to allow everything.
      // In practice, you would want to set more restrictive policies.
      toSudoPolicy({}),
    ],
  })

  const sessionKeyAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
      regular: permissionPlugin,
    },
  })

  // Include the private key when you serialize the session key
  return await serializePermissionAccount(sessionKeyAccount, sessionPrivateKey)
}

const useSessionKey = async (serializedSessionKey: string) => {
  const sessionKeyAccount = await deserializePermissionAccount(
    publicClient,
    entryPoint,
    serializedSessionKey
  )

  const kernelPaymaster = createZeroDevPaymasterClient({
    entryPoint,
    chain: sepolia,
    transport: http(process.env.PAYMASTER_RPC),
  })
  const kernelClient = createKernelAccountClient({
    entryPoint,
    account: sessionKeyAccount,
    chain: sepolia,
    bundlerTransport: http(process.env.BUNDLER_RPC),
    middleware: {
      sponsorUserOperation: kernelPaymaster.sponsorUserOperation,
    },
  })

  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await sessionKeyAccount.encodeCallData({
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      }),
    },
  })

  console.log("userOp hash:", userOpHash)
}

const main = async () => {
  const sessionPrivateKey = generatePrivateKey()
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey)
  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyAccount,
  })

  // The owner creates a session key, serializes it, and shares it with the agent.
  const serializedSessionKey = await createSessionKey(
    sessionKeySigner,
    sessionPrivateKey
  )

  // The agent reconstructs the session key using the serialized value
  await useSessionKey(serializedSessionKey)
}

main()
