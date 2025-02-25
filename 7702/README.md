# ZeroDev + 7702

This is an example of upgrading a EOA to a ZeroDev smart account (Kernel) using [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702).

Note that EIP-7702 has not been officially deployed; it's scheduled to go live in April along with the Pectra upgrade.  For now, you must use a testnet that supports EIP-7702, such as [the Odyssey testnet](https://hub.conduit.xyz/odyssey) or [the Holesky testnet](https://cloud.google.com/application/web3/faucet/ethereum/holesky).

## Using the example

### Create a ZeroDev project for Odyssey

Create a project for `Odyssey Testnet` or `Holesky Testnet` on the [ZeroDev dashboard](https://dashboard.zerodev.app).

If you want to try gas sponsorship, remember to set a gas policy.

### Set up your `.env`

Create a `.env` file at the **root directory** of this repo.

```env
BUNDLER_RPC=
PAYMASTER_RPC=
PRIVATE_KEY=
```

You can obtain the bundler and paymaster URLs from the ZeroDev dashboard.  The private key is the key of the EOA wallet you want to upgrade.

### Run the script

Now simply run the script (from the root directory of the repo):

```bash
npx ts-node ./7702/upgrade-eoa.ts
```

Voilà!  Now you have upgraded your EOA to ZeroDev Kernel.

### Try using your 7702 account

Now that your EOA is a smart account, you can use the ZeroDev SDK as usual, with one modification.  When you set up your Kernel account with the SDK, you must set its address to the EOA address; otherwise the SDK defaults to using the counterfactual smart account address.

```ts
import { createKernelAccount } from "@zerodev/sdk"
 
const account = await createKernelAccount(publicClient, {
  plugins: {
    sudo: ecdsaValidator,
  },
  entryPoint,
  kernelVersion,

  // Set the EOA address here
  address: '<EOA address>',
})
```
