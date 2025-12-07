# Conway's Game of Life - Stellar/Soroban

A serverless implementation of [Conway's Game of Life](https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life) using Stellar's Soroban smart contracts. The game logic runs entirely on the blockchain, with the frontend making free read-only calls via transaction simulation.

**[Live Demo](https://wyhaines.github.io/stellar-game-of-life/)** | **[Contract on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CCPQTZA3KUWEBPKD3TF4TWBZPJTC4M2PVVMDUQ22PF7QQ57AZQUJZGBL)**

**This project demonstrates that building web applications on blockchain involves basic patterns that front-end developers may already be familiar with.**

This project uses a toy -- an implementation of Conway's cellular automata simulation -- to show how a standard React frontend can interact with a Soroban smart contract using patterns that will feel familiar to any web developer.

The Game of Life logic runs on-chain, but from the frontend's perspective, it's just: send data, get data back.

## Features

- **Serverless**: No backend servers required - this will run from any static web host
- **Free Execution**: Uses Soroban's `simulateTransaction` for free read-only contract calls (yes, the Game of Life math could run client-side, but that defeats the purpose of a demo)
- **Multi-Colony Support**: Multiple cell types compete for territory, with new cells inheriting the dominant neighbor type
- **Configurable**: Adjust board size, animation speed, cell colors, and more
- **Classic Patterns**: Includes preset patterns (glider, blinker, block, glider gun, and more)

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

---

## How the Frontend Calls a Smart Contract

This section walks through exactly how the web frontend communicates with the Soroban smart contract that has been deployed out to a Stellar network (Soroban Quickstart, testnet, or mainnet).

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
  React Frontend   ──────►    Stellar RPC      ──────►   Soroban Contract
                   ◄──────     Server          ◄──────    (WebAssembly)   
└─────────────────┘         └─────────────────┘         └─────────────────┘
                 
     JavaScript                  JSON-RPC                    Rust/WASM
```

The frontend builds a transaction, sends it to an RPC server for simulation, and gets the result back. No wallet needed for read-only operations, no gas fees—just a function call.

### Step-by-Step: Making a Contract Call

Here's the actual code from `App.jsx` that calls the smart contract, with detailed explanations:

#### 1. Import the Stellar SDK

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

The `@stellar/stellar-sdk` package provides everything needed to interact with Stellar and Soroban. Imports:
- `StellarRpc` - Client for communicating with the RPC server
- `nativeToScVal` - Converts JavaScript values to Soroban's type system
- `scValToNative` - Converts Soroban values back to JavaScript
- `TransactionBuilder` - Constructs the transaction envelope
- `Operation` - Defines what the transaction does (invoke a contract function)

#### 2. Initialize the RPC Client

```javascript
const rpcUrl = "https://soroban-testnet.stellar.org"
const rpcServer = new StellarRpc.Server(rpcUrl, { allowHttp: true })
```

This creates a client that communicates with a Stellar RPC server. For local development, you can use the [Stellar Quickstart](https://github.com/stellar/quickstart) docker image to easily run a local environment. Using that, you'd point this to `http://localhost:8000/soroban/rpc`.

#### 3. Build the Transaction

```javascript
// Get an account to use as the transaction source
const account = await rpcServer.getAccount(simulatorAddress)

// Build a transaction that invokes the contract
const tx = new TransactionBuilder(account, {
  fee: BASE_FEE,
  networkPassphrase: networkPassphrase,
})
  .setTimeout(30)
  .addOperation(
    Operation.invokeContractFunction({
      function: "next_generation",      // The contract function to call
      contract: contractId,              // The deployed contract's ID
      args: [nativeToScVal(board, { type: "string" })],  // Function arguments
    })
  )
  .build()
```

**What's happening here:**
- We fetch account details (needed for transaction structure, even for simulations)
- `TransactionBuilder` creates a transaction envelope
- `Operation.invokeContractFunction` specifies which contract function to call
- `nativeToScVal` converts our JavaScript string (`board`) to Soroban's string type
- The contract ID is a base32-encoded identifier (e.g., `CCPQTZA3KUWEBPKD3TF4TWBZPJTC4M2PVVMDUQ22PF7QQ57AZQUJZGBL`)

#### 4. Simulate the Transaction

```javascript
const sim = await rpcServer.simulateTransaction(tx)
```

The `simulateTransaction` method:
- Sends the transaction to the RPC server
- The server executes the contract in a sandbox
- Returns the result without actually submitting to the blockchain
- **Costs nothing** - because `simulateTransaction` is read only, there are no fees

The contract runs, computes the next generation of the Game of Life, and returns the result.

#### 5. Extract and Convert the Result

```javascript
// Check for errors
if (StellarRpc.Api.isSimulationError(sim)) {
  throw new Error(sim.error)
}

// Extract the return value and convert to JavaScript
const result = sim.result?.retval
const nextBoard = scValToNative(result)  // Now it's a regular JavaScript string
```

The response contains the contract's return value in Soroban's type system. `scValToNative` converts it back to a JavaScript string that we can render in the UI.

### The Complete Flow

```javascript
async function getNextGeneration(currentBoard) {
  // 1. Get account for transaction structure
  const account = await rpcServer.getAccount(simulatorAddress)

  // 2. Build transaction with contract call
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

  // 3. Simulate (execute without submitting)
  const sim = await rpcServer.simulateTransaction(tx)

  // 4. Handle errors
  if (StellarRpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error)
  }

  // 5. Convert result to JavaScript and return
  return scValToNative(sim.result?.retval)
}
```

**Pretty straightforward** Five steps to call a smart contract from JavaScript. The pattern is:
1. Build a transaction
2. Simulate it
3. Extract the result

### Why `simulateTransaction` Instead of Submitting?

Stellar/Soroban distinguishes between:

| Operation | Submits to Blockchain | Costs Fees | Changes State |
|-----------|----------------------|------------|---------------|
| `simulateTransaction` | No | No | No |
| `sendTransaction` | Yes | Yes | Yes |

Since we just need the computation (not persistent storage), simulation is perfect (and free).

If you were building an application that needed to persist state (like a game with high scores, or a DeFi application), you'd use `sendTransaction` instead. That requires signing the transaction with a wallet and paying a small fee, but from the developer's POV, it is a very similar operation.

### Error Handling

The frontend detects when the board exceeds the smart contract's resource limits:

```javascript
if (StellarRpc.Api.isSimulationError(sim)) {
  const errorMsg = sim.error || 'Unknown simulation error'
  if (errorMsg.includes('Budget') || errorMsg.includes('ExceededLimit')) {
    throw new Error('Board too large - exceeded smart contract resource limits.')
  }
  throw new Error(`Contract error: ${errorMsg}`)
}
```

This provides user-friendly feedback when the computation exceeds available resources.

---

## The Smart Contract

The Soroban contract is written in Rust and compiled to WebAssembly. Here's the core interface:

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

The contract:
- Receives a board state as a string (rows separated by newlines)
- Applies Conway's Game of Life rules
- Returns the next generation as a string
- Supports multiple cell types (characters) for "competing colonies"
- Uses Soroban's PRNG for random tie-breaking

---

## Prerequisites

### For Frontend Development

- Node.js 18+
- npm or yarn

### For Smart Contract Development

1. Install Rust:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source ~/.cargo/env
   rustup target add wasm32-unknown-unknown
   ```

2. Install Soroban CLI:
   ```bash
   cargo install --locked soroban-cli
   ```

3. Set up testnet identity:
   ```bash
   soroban keys generate --global deployer --network testnet
   soroban keys fund deployer --network testnet
   ```

## Quick Start

### 1. Build and Deploy the Smart Contract

```bash
cd contracts/game-of-life
soroban contract build

# Deploy to testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/game_of_life.wasm \
  --source deployer \
  --network testnet
```

Save the returned contract ID.

### 2. Configure the Frontend

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
soroban keys address deployer
```

### 3. Run the Frontend

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Local Development with Stellar Quickstart

For local development without using testnet, you can run a local Stellar network:

```bash
# Start local Stellar network with Docker
docker run --rm -it \
  -p 8000:8000 \
  --name stellar \
  stellar/quickstart:latest \
  --standalone \
  --enable-soroban-rpc

# Configure CLI for local network
soroban network add standalone \
  --rpc-url http://localhost:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017"

# Create and fund a local identity
soroban keys generate --global local-deployer --network standalone
soroban keys fund local-deployer --network standalone

# Deploy contract locally
soroban contract deploy \
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

### Rust Contract Tests

```bash
cd contracts/game-of-life
cargo test
```

### Frontend

```bash
npm run build
npm run preview
```

## Deployment

### Contract to Mainnet

```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/game_of_life.wasm \
  --source deployer \
  --network mainnet
```

Note: Mainnet deployment costs a small fee, but all subsequent simulation calls are free.

### Frontend to GitHub Pages

The repository includes a GitHub Actions workflow that automatically builds and deploys to GitHub Pages on every push to `main`. The live demo uses the testnet contract:

| Network | Contract ID |
|---------|-------------|
| Testnet | `CCPQTZA3KUWEBPKD3TF4TWBZPJTC4M2PVVMDUQ22PF7QQ57AZQUJZGBL` |

To deploy manually:
```bash
npm run build
# Deploy the dist/ folder to GitHub Pages
```

## tl;Dr

Smart contract calls are just API calls. Read-only calls are free. The SDK handles type conversion. You don't need a wallet for reads. That's basically it.

---

## License

MIT
