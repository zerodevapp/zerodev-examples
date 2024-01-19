import "dotenv/config"
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
  addressToEmptyAccount,
} from "@kerneljs/core"
import { signerToEcdsaValidator } from "@kerneljs/ecdsa-validator"
import {
  signerToSessionKeyValidator,
  ParamOperator,
  serializeSessionKeyAccount,
  deserializeSessionKeyAccount,
  oneAddress,
} from "@kerneljs/session-key"
import { UserOperation } from "permissionless"
import {
  http,
  Hex,
  createPublicClient,
  parseAbi,
  encodeFunctionData,
} from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { polygonMumbai } from "viem/chains"

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
const contractAddress = "0x34bE7f35132E97915633BC1fc020364EA5134863"
const contractABI = parseAbi([
  "function mint(address _to) public",
  "function balanceOf(address owner) external view returns (uint256 balance)",
])

const sessionPrivateKey = generatePrivateKey()
const sessionKeySigner = privateKeyToAccount(sessionPrivateKey)

const createSessionKey = async () => {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
  })

  const masterAccount = await createKernelAccount(publicClient, {
    plugins: {
      validator: ecdsaValidator,
    },
  })
  console.log("Account address:", masterAccount.address)

  // You only need the session key signer's address in order to create a session key
  const emptySessionKeySigner = addressToEmptyAccount(sessionKeySigner.address)

  const sessionKeyValidator = await signerToSessionKeyValidator(publicClient, {
    signer: emptySessionKeySigner,
    validatorData: {
      paymaster: oneAddress,
      permissions: [
        {
          target: contractAddress,
          // Maximum value that can be transferred.  In this case we
          // set it to zero so that no value transfer is possible.
          valueLimit: BigInt(0),
          // Contract abi
          abi: contractABI,
          // Function name
          functionName: "mint",
          // An array of conditions, each corresponding to an argument for
          // the function.
          args: [
            {
              // In this case, we are saying that the session key can only mint
              // NFTs to the account itself
              operator: ParamOperator.EQUAL,
              value: masterAccount.address,
            },
          ],
        },
      ],
    },
  })

  const sessionKeyAccount = await createKernelAccount(publicClient, {
    plugins: {
      defaultValidator: ecdsaValidator,
      validator: sessionKeyValidator,
    },
  })

  return await serializeSessionKeyAccount(sessionKeyAccount)
}

const useSessionKey = async (serializedSessionKey: string) => {
  const sessionKeyAccount = await deserializeSessionKeyAccount(publicClient, serializedSessionKey, sessionKeySigner)

  const kernelClient = createKernelAccountClient({
    account: sessionKeyAccount,
    chain: polygonMumbai,
    transport: http(process.env.BUNDLER_RPC),
    sponsorUserOperation: async ({ userOperation }): Promise<UserOperation> => {
      const kernelPaymaster = createZeroDevPaymasterClient({
        chain: polygonMumbai,
        transport: http(process.env.PAYMASTER_RPC),
      })
      return kernelPaymaster.sponsorUserOperation({
        userOperation,
      })
    },
  })

  const txnHash = await kernelClient.sendTransaction({
    to: contractAddress,
    value: BigInt(0),
    data: encodeFunctionData({
      abi: contractABI,
      functionName: "mint",
      args: [sessionKeyAccount.address],
    }),
  })

  console.log("txn hash:", txnHash)

  const userOpHash = await kernelClient.sendUserOperation({
    userOperation: {
      callData: await sessionKeyAccount.encodeCallData({
        to: contractAddress,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: contractABI,
          functionName: "mint",
          args: [sessionKeyAccount.address],
        }),
      }),
    },
  })

  console.log("userOp hash:", userOpHash)
}

const main = async () => {

  // Create a session key.
  // This is typically done by the owner
  const serializedSessionKey = await createSessionKey()

  // Use a session key.
  // Presumably, the session key is sent to the agent.
  await useSessionKey(serializedSessionKey)

}

main()
