import "dotenv/config"
import { zeroAddress } from "viem"
import { getKernelClient } from "../utils"
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless"
import { getCustomNonceKeyFromString } from "@zerodev/sdk"

const entryPoint = ENTRYPOINT_ADDRESS_V07
async function main() {
    const kernelClient = await getKernelClient(entryPoint)

    const customNonceKey1 = getCustomNonceKeyFromString(
        "Custom Nonce Key Example 1",
        entryPoint
    )

    const customNonceKey2 = getCustomNonceKeyFromString(
        "Custom Nonce Key Example 2",
        entryPoint
    )

    const nonce1 = await kernelClient.account.getNonce(customNonceKey1)
    const nonce2 = await kernelClient.account.getNonce(customNonceKey2)

    const [userOpHash1, userOpHash2] = await Promise.all([
        kernelClient.sendUserOperation({
            userOperation: {
                callData: await kernelClient.account.encodeCallData({
                    to: zeroAddress,
                    value: BigInt(0),
                    data: "0x"
                }),
                nonce: nonce1
            }
        }),
        kernelClient.sendUserOperation({
            userOperation: {
                callData: await kernelClient.account.encodeCallData({
                    to: zeroAddress,
                    value: BigInt(0),
                    data: "0x"
                }),
                nonce: nonce2
            }
        })
    ])

    console.log("UserOp1 hash:", userOpHash1)
    console.log("UserOp2 hash:", userOpHash2)
    console.log("Waiting for UserOp to complete...")

    const bundlerClient = kernelClient.extend(bundlerActions(entryPoint))
    await Promise.all([
        bundlerClient.waitForUserOperationReceipt({ hash: userOpHash1 }),
        bundlerClient.waitForUserOperationReceipt({ hash: userOpHash2 })
    ])

    console.log("UserOp completed")
}

main()
