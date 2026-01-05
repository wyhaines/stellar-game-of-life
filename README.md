# Conway's Game of Life on Soroban

An implementation of [Conway's Game of Life](https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life) running on Stellar's Soroban smart contracts. The game logic executes on-chain, while the React frontend makes free read-only calls through transaction simulation.

**[Live Demo](https://wyhaines.github.io/stellar-game-of-life/)** | **[Contract on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CAU2GHALHVXTLBQ7CXN4M65V5XLTSAKPAA25IKPHPTFEBBOBG6HIOERX)**

This project shows how a React frontend can interact with a Soroban smart contract using patterns familiar to any web developer. The Game of Life math runs on-chain, but from the frontend's perspective, it works like any other API: send data, get data back.

The frontend requires no backend servers and runs from any static web host. It uses Soroban's `simulateTransaction` for free read-only contract calls. The implementation supports multiple cell types that compete for territory, with configurable board size, animation speed, and colors. Several classic patterns are included: glider, blinker, block, glider gun, and others.

## Project Structure

```
stellar-game-of-life/
├── contracts/
│   └── game-of-life/          # Soroban smart contract (Rust)
│       ├── Cargo.toml
│       └── src/lib.rs
├── src/                        # React frontend
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── package.json
└── ...
```

## How the Frontend Calls the Smart Contract

The frontend builds a transaction, sends it to an RPC server for simulation, and receives the result. Read-only operations require no wallet and incur no fees.

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
  React Frontend   ──────►    Stellar RPC      ──────►   Soroban Contract
                   ◄──────     Server          ◄──────    (WebAssembly)
└─────────────────┘         └─────────────────┘         └─────────────────┘

     JavaScript                  JSON-RPC                    Rust/WASM
```

### Importing the SDK

```javascript
import {
  rpc as StellarRpc,
  scValToNative,
  nativeToScVal,
  TransactionBuilder,
  BASE_FEE,
  Operation,
} from "@stellar/stellar-sdk"
```

The `@stellar/stellar-sdk` package provides everything needed to interact with Stellar and Soroban. `StellarRpc` handles communication with the RPC server. `nativeToScVal` and `scValToNative` convert between JavaScript types and Soroban's type system. `TransactionBuilder` constructs the transaction envelope, and `Operation` defines the contract invocation.

### Initializing the RPC Client

```javascript
const rpcUrl = "https://soroban-testnet.stellar.org"
const rpcServer = new StellarRpc.Server(rpcUrl, { allowHttp: true })
```

This creates a client that communicates with a Stellar RPC server. For local development, the [Stellar Quickstart](https://github.com/stellar/quickstart) Docker image provides a local network at `http://localhost:8000/soroban/rpc`.

### Building the Transaction

```javascript
const account = await rpcServer.getAccount(simulatorAddress)

const tx = new TransactionBuilder(account, {
  fee: BASE_FEE,
  networkPassphrase: networkPassphrase,
})
  .setTimeout(30)
  .addOperation(
    Operation.invokeContractFunction({
      function: "next_generation",
      contract: contractId,
      args: [nativeToScVal(board, { type: "string" })],
    })
  )
  .build()
```

The transaction requires account details for its structure, even for simulations. `Operation.invokeContractFunction` specifies the contract function to call and its arguments. `nativeToScVal` converts the JavaScript board string to Soroban's string type. The contract ID is a base32-encoded identifier like `CAU2GHALHVXTLBQ7CXN4M65V5XLTSAKPAA25IKPHPTFEBBOBG6HIOERX`.

### Simulating the Transaction

```javascript
const sim = await rpcServer.simulateTransaction(tx)
```

The `simulateTransaction` method sends the transaction to the RPC server, which executes the contract in a sandbox and returns the result without submitting anything to the blockchain. This costs nothing because simulation is read-only.

### Extracting the Result

```javascript
if (StellarRpc.Api.isSimulationError(sim)) {
  throw new Error(sim.error)
}

const result = sim.result?.retval
const nextBoard = scValToNative(result)
```

The response contains the contract's return value in Soroban's type system. `scValToNative` converts it back to a JavaScript string for rendering in the UI.

### Complete Example

```javascript
async function getNextGeneration(currentBoard) {
  const account = await rpcServer.getAccount(simulatorAddress)

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase,
  })
    .setTimeout(30)
    .addOperation(
      Operation.invokeContractFunction({
        function: "next_generation",
        contract: contractId,
        args: [nativeToScVal(currentBoard, { type: "string" })],
      })
    )
    .build()

  const sim = await rpcServer.simulateTransaction(tx)

  if (StellarRpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error)
  }

  return scValToNative(sim.result?.retval)
}
```

### Simulation vs. Submission

| Operation | Submits to Blockchain | Costs Fees | Changes State |
|-----------|----------------------|------------|---------------|
| `simulateTransaction` | No | No | No |
| `sendTransaction` | Yes | Yes | Yes |

Since this application only needs computation without persistent storage, simulation works well. Applications that need to persist state (high scores, DeFi operations) would use `sendTransaction` instead. That requires signing with a wallet and paying a small fee, but the code structure is similar.

### Error Handling

The frontend detects when the board exceeds the contract's resource limits:

```javascript
if (StellarRpc.Api.isSimulationError(sim)) {
  const errorMsg = sim.error || 'Unknown simulation error'
  if (errorMsg.includes('Budget') || errorMsg.includes('ExceededLimit')) {
    throw new Error('Board too large - exceeded smart contract resource limits.')
  }
  throw new Error(`Contract error: ${errorMsg}`)
}
```

Stellar nodes have resource limits for contract execution. Large boards may exceed these limits, and the frontend translates the resulting error into something readable.

## The Smart Contract

The Soroban contract is written in Rust and compiled to WebAssembly:

```rust
#[contract]
pub struct GameOfLife;

#[contractimpl]
impl GameOfLife {
    /// Computes the next generation of Conway's Game of Life.
    /// Board format: rows separated by newlines, space = dead, any other char = alive.
    /// Newly born cells inherit the dominant neighbor type; ties are broken randomly.
    pub fn next_generation(env: Env, board: String) -> String {
        // ... implementation
    }
}
```

The contract receives a board state as a newline-separated string, applies the Game of Life rules, and returns the next generation. It supports multiple cell types (any non-space character), with newly born cells inheriting the dominant neighbor type. Ties are broken using Soroban's PRNG.

## Prerequisites

Frontend development requires Node.js 18+ and npm or yarn.

Smart contract development requires Rust and the Stellar CLI. Install Rust with:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
rustup target add wasm32-unknown-unknown
```

Install the Stellar CLI:

```bash
cargo install --locked stellar-cli
```

Set up a testnet identity:

```bash
stellar keys generate --global deployer --network testnet
stellar keys fund deployer --network testnet
```

## Quick Start

### Build and Deploy the Contract

```bash
cd contracts/game-of-life
stellar contract build \
  --meta source_repo=github:wyhaines/stellar-game-of-life \
  --meta home_domain=wyhaines.github.io

stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/game_of_life.wasm \
  --source deployer \
  --network testnet
```

The `--meta` flags embed [SEP-0055](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0055.md) metadata into the WASM binary. This enables contract verification by linking the deployed contract to its source repository.

Save the returned contract ID.

### Configure the Frontend

```bash
cp .env.example .env
```

Edit `.env` with your deployed contract ID and simulator address:

```
VITE_CONTRACT_ID=<your-contract-id>
VITE_SIMULATOR_ADDRESS=<your-stellar-address>
```

Get your address with:

```bash
stellar keys address deployer
```

### Run the Frontend

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Local Development with Stellar Quickstart

To develop locally without using testnet, run a local Stellar network with Docker:

```bash
docker run --rm -it \
  -p 8000:8000 \
  --name stellar \
  stellar/quickstart:latest \
  --standalone \
  --enable-soroban-rpc
```

Configure the CLI for the local network:

```bash
stellar network add standalone \
  --rpc-url http://localhost:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017"

stellar keys generate --global local-deployer --network standalone
stellar keys fund local-deployer --network standalone

stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/game_of_life.wasm \
  --source local-deployer \
  --network standalone
```

Update `.env` for local development:

```
VITE_NETWORK_PASSPHRASE=Standalone Network ; February 2017
VITE_RPC_URL=http://localhost:8000/soroban/rpc
VITE_CONTRACT_ID=<your-local-contract-id>
VITE_SIMULATOR_ADDRESS=<your-local-address>
```

## Testing

Run Rust contract tests:

```bash
cd contracts/game-of-life
cargo test
```

Build and preview the frontend:

```bash
npm run build
npm run preview
```

## Deployment

### Contract to Mainnet

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/game_of_life.wasm \
  --source deployer \
  --network mainnet
```

Mainnet deployment has a small fee; simulation calls are free afterward.

### Frontend to GitHub Pages

The repository includes a GitHub Actions workflow that builds and deploys to GitHub Pages on every push to `main`. The live demo uses the testnet contract `CAU2GHALHVXTLBQ7CXN4M65V5XLTSAKPAA25IKPHPTFEBBOBG6HIOERX`.

To deploy manually:

```bash
npm run build
# Deploy the dist/ folder to GitHub Pages
```

## License

MIT
