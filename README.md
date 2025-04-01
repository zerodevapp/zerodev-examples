# ZeroDev Examples

## Setup and Installation

Follow these steps to get this project up and running on your local machine:

1. **Clone the repository**

   Use the following command to clone this repository to your local machine:

   ```bash
   git clone git@github.com:zerodevapp/zerodev-examples.git
   ```

2. **Install dependencies**

   Navigate to the project directory and install the dependencies:

   ```bash
   cd zerodev-examples
   npm install
   ```

3. **Setup environment variables**

   Copy the `.env.example` file to `.env` and fill in the values:

   ```bash
    cp .env.example .env
    ```

   For `ZERODEV_RPC`, you can get it from [the ZeroDev dashboard](https://dashboard.zerodev.app/) by creating a project. The examples use Sepolia, so make sure to create a project for Sepolia.
   
   The `PRIVATE_KEY` can be any valid Ethereum private key.  You should use a random test key.
   
   If you want to run the examples on another network, make sure to update the `chain` object in the code (some examples use the chain object in [./utils.ts](./utils.ts) so you'd need to update it there).

4. **Run the script**

   Run any of the example scripts using the following command:

   ```bash
   npx ts-node path/to/script.ts
   ```