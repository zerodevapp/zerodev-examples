import { createZeroDevPaymasterClient } from "@zerodev/sdk"
import { http } from "viem"
import { polygonMumbai } from "viem/chains"

const main = async () => {
    const kernelPaymaster = createZeroDevPaymasterClient({
        chain: polygonMumbai,
        transport: http(process.env.PAYMASTER_RPC)
    })

    const result = await kernelPaymaster.estimateGasInERC20({
        userOperation: {
            sender: "0x1Ed00500D1F5F24dD2FCA3f9097b0110fEEe5367",
            nonce: BigInt(1),
            initCode: "0x",
            callData: "0x",
            paymasterAndData:
                "0xc03aac639bb21233e0139381970328db8bceeb67000000000000000065fa91d90000000000000000000000000000000000000000a50b183d9a8256ffb7c1491491725c262dc5b2f1db8cfade88963b8a69ac3f8274b5500d0340c555d1c64cd35afabe6c50f9bc4c",
            signature:
                "0x000000001f9ae4080c6a830b0a066f84997b8a0318c795ba4932f9dd2f39ac154b26e9d57b3ddc32dd91f36d54d874f4649e6fb7d520084edd000a42f26e3901add99c461c97f18c9f29de2321cd1477aae5d3173958fc0e0e5df5bbae5430a9d4fa43996c57cd26749202c4fde2d801668173ee2e3910f97858fdbf8f4674c9ce4316d90e1b",
            maxFeePerGas: BigInt("0x62590098"),
            maxPriorityFeePerGas: BigInt("0x62590080"),
            callGasLimit: BigInt("0x238C"),
            verificationGasLimit: BigInt("0x604A1"),
            preVerificationGas: BigInt("0xCA08")
        },
        gasTokenAddress: "0x9999f7Fea5938fD3b1E26A12c3f2fb024e194f97"
    })

    console.log(`fee: ${result.amount} USDC`)
}

main()
