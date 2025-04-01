# ZeroDev Intent
## Overview

The examples show how to use zerodev intent with three different gas payment approaches:

1. `main.ts` - Default gas payment using same tokens as inputTokens. 
2. `native.ts` - Gas paid with native tokens (ETH)
3. `sponsored.ts` - Gas sponsored by the developer

Additionally, there are utilities for migration and fee estimation:

### Migration Tools
- `enableIntent.ts` - Upgrades kernel version and installs intent executor (required for intent functionality)
- `migrateToIntentExecutor.ts` - Installs the intent executor for existing accounts

### Fee Estimation
- `estimateFee.ts` - Estimates transaction fees before sending an intent, helping users understand costs upfront

## Prerequisites

1. Set up environment variables:
   ```
   PRIVATE_KEY=your_private_key
   ZERODEV_RPC=your_zerodev_rpc_url
   ZERODEV_MULTI_CHAIN_PROJECT_ID=your_project_id  # Required for sponsored transactions
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Cross-chain Transfer Examples
Each transfer example follows the same flow:
1. Creates a kernel account with intent executor
2. Get the CAB balance
3. Performs a cross-chain transfer to Base
4. Waits for intent confirmation

```bash
npx ts-node intent/main.ts # Default gas payment with USDC
npx ts-node intent/native.ts # Gas payment with native tokens
npx ts-node intent/sponsored.ts # Gas sponsored by developer
```

### Migration and Utilities Examples
```bash
# Upgrade kernel and enable intent
npx ts-node intent/enableIntent.ts

# Install intent executor on existing account
npx ts-node intent/migrateToIntentExecutor.ts

# Estimate fees for an intent
npx ts-node intent/estimateFee.ts
```


