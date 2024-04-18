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

   Copy the `.env.example` file to `.env` and fill in the required values (most examples only require a few of these env vars)

   ```bash
    cp .env.example .env
    ```

   You can find your bundler & paymaster URLs on [the ZeroDev dashboard](https://dashboard.zerodev.app/).  The examples use ETH Sepolia, so make sure to create a ZeroDev project for ETH Sepolia.  If you want to run the examples on another network, make sure to update the `chain` object in the code.

4. **Run the script**

   Run any of the example scripts using the following command:

   ```bash
   npx ts-node path/to/script.ts
   ```
