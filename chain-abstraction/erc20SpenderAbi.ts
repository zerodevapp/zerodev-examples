export const erc20SpenderAbi = [
  {
    type: "function",
    name: "spendAllowance",
    inputs: [
      {
        name: "tokenAddress",
        type: "address",
        internalType: "address",
      },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
