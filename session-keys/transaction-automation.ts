import "dotenv/config"
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
  addressToEmptyAccount,
} from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless"
import {
  http,
  Hex,
  createPublicClient, Address,
  zeroAddress
} from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { toECDSASigner } from "@zerodev/permissions/signers"
import { toSudoPolicy } from "@zerodev/permissions/policies"
import {
  ModularSigner,
  deserializePermissionAccount,
  serializePermissionAccount,
  toPermissionValidator,
} from "@zerodev/permissions"

if (
  !process.env.BUNDLER_RPC ||
  !process.env.PAYMASTER_RPC ||
  !process.env.PRIVATE_KEY
) {
  throw new Error("BUNDLER_RPC or PAYMASTER_RPC or PRIVATE_KEY is not set")
}

const publicClient = createPublicClient({
  transport: http(process.env.BUNDLER_RPC),
})

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
const entryPoint = ENTRYPOINT_ADDRESS_V07

const getApproval = async (sessionKeyAddress: Address) => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    entryPoint,
    signer,
  })

  // Create an "empty account" as the signer -- you only need the public
  // key (address) to do this.
  const emptyAccount = addressToEmptyAccount(sessionKeyAddress)
  const emptySessionKeySigner = await toECDSASigner({ signer: emptyAccount })

  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint,
    signer: emptySessionKeySigner,
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

  return await serializePermissionAccount(sessionKeyAccount)
}

const useSessionKey = async (
  approval: string,
  sessionKeySigner: ModularSigner
) => {
  const sessionKeyAccount = await deserializePermissionAccount(
    publicClient,
    entryPoint,
    approval,
    sessionKeySigner
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
  // The agent creates a public-private key pair and sends
  // the public key (address) to the owner.
  const sessionPrivateKey = generatePrivateKey()
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey)

  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyAccount,
  })

  // The owner approves the session key by signing its address and sending
  // back the signature
  const approval = await getApproval(sessionKeySigner.account.address)

  // The agent constructs a full session key
  await useSessionKey(approval, sessionKeySigner)
}

main()
