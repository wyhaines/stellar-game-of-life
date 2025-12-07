import React, { useEffect, useState, useCallback, useRef } from "react"
import {
  rpc as StellarRpc,
  scValToNative,
  nativeToScVal,
  TransactionBuilder,
  BASE_FEE,
  Networks,
  Operation,
  xdr,
} from "@stellar/stellar-sdk"
import {
  PlayIcon,
  PauseIcon,
  ArrowPathIcon,
  AdjustmentsHorizontalIcon,
  ForwardIcon,
} from "@heroicons/react/24/solid"

const PRESETS = {
  glider: " O \n  O\nOOO",
  lwss: " O  O\nO    \nO   O\nOOOO ",
  blinker: "OOO",
  block: "OO\nOO",
  beacon: "OO  \nO   \n   O\n  OO",
  toad: " OOO\nOOO ",
  pulsar: "  OOO   OOO  \n             \nO    O O    O\nO    O O    O\nO    O O    O\n  OOO   OOO  \n             \n  OOO   OOO  \nO    O O    O\nO    O O    O\nO    O O    O\n             \n  OOO   OOO  ",
  gun: "                        O           \n                      O O           \n            OO      OO            OO\n           O   O    OO            OO\nOO        O     O   OO              \nOO        O   O OO    O O           \n          O     O       O           \n           O   O                    \n            OO                      ",
}

const rotatePattern = (pattern, degrees) => {
  if (degrees === 0) return pattern

  const rows = pattern.split('\n')
  const height = rows.length
  const width = Math.max(...rows.map(r => r.length))
  const grid = rows.map(r => r.padEnd(width, ' ').split(''))

  let rotated
  if (degrees === 90) {
    rotated = Array(width).fill(null).map((_, x) =>
      Array(height).fill(null).map((_, y) => grid[height - 1 - y][x]).join('')
    )
  } else if (degrees === 180) {
    rotated = grid.map(row => row.reverse().join('')).reverse()
  } else if (degrees === 270) {
    rotated = Array(width).fill(null).map((_, x) =>
      Array(height).fill(null).map((_, y) => grid[y][width - 1 - x]).join('')
    )
  }

  return rotated.join('\n')
}

export default function App() {
  const networkPassphrase = import.meta.env.VITE_NETWORK_PASSPHRASE || Networks.TESTNET
  const rpcUrl = import.meta.env.VITE_RPC_URL || "https://soroban-testnet.stellar.org"
  const contractId = import.meta.env.VITE_CONTRACT_ID || ""
  const simulatorAddress = import.meta.env.VITE_SIMULATOR_ADDRESS || ""

  const [rpcServer] = useState(() => new StellarRpc.Server(rpcUrl, { allowHttp: true }))
  const [dimensions, setDimensions] = useState({ width: 20, height: 20 })
  const [density, setDensity] = useState(0.3)
  const [isRunning, setIsRunning] = useState(false)
  const [generation, setGeneration] = useState("")
  const [showSettings, setShowSettings] = useState(true)
  const [error, setError] = useState(null)
  const [cellColor, setCellColor] = useState('#10b981')
  const [cellCharacters, setCellCharacters] = useState(' O')
  const [cellCharInput, setCellCharInput] = useState(' O')
  const [cellCharError, setCellCharError] = useState(null)
  const [animationSpeed, setAnimationSpeed] = useState(500)
  const [generationCount, setGenerationCount] = useState(0)
  const [selectedBrush, setSelectedBrush] = useState('O')

  const validateCellCharacters = (value) => {
    for (let i = 0; i < value.length; i++) {
      if (value.charCodeAt(i) > 127) {
        return `"${value[i]}" is not supported. Please use only ASCII characters (A-Z, a-z, 0-9, symbols).`
      }
    }
    return null
  }

  const handleCellCharactersChange = (e) => {
    const value = e.target.value
    setCellCharInput(value)
    const error = validateCellCharacters(value)
    setCellCharError(error)
    if (!error) {
      setCellCharacters(value)
      const chars = value.split('').filter(c => c !== ' ')
      if (chars.length > 0 && !chars.includes(selectedBrush)) {
        setSelectedBrush(chars[0])
      }
    }
  }

  const insertPattern = useCallback((pattern) => {
    if (!generation) return

    const boardRows = generation.split('\n')
    const boardHeight = boardRows.length
    const boardWidth = boardRows[0]?.length || 0

    const rotations = [0, 90, 180, 270]
    const validRotations = rotations.filter(deg => {
      const rotated = rotatePattern(pattern, deg)
      const rows = rotated.split('\n')
      const height = rows.length
      const width = Math.max(...rows.map(r => r.length))
      return width <= boardWidth && height <= boardHeight
    })

    if (validRotations.length === 0) {
      const origRows = pattern.split('\n')
      const origHeight = origRows.length
      const origWidth = Math.max(...origRows.map(r => r.length))
      setError(`Pattern (${origWidth}x${origHeight}) too large for board (${boardWidth}x${boardHeight}) in any orientation`)
      return
    }

    const rotation = validRotations[Math.floor(Math.random() * validRotations.length)]
    const rotatedPattern = rotatePattern(pattern, rotation)

    const patternRows = rotatedPattern.split('\n')
    const patternHeight = patternRows.length
    const patternWidth = Math.max(...patternRows.map(r => r.length))

    const maxX = boardWidth - patternWidth
    const maxY = boardHeight - patternHeight
    const startX = Math.floor(Math.random() * (maxX + 1))
    const startY = Math.floor(Math.random() * (maxY + 1))

    const chars = cellCharacters.split('').filter(c => c !== ' ')
    const patternChar = chars.length > 0 ? chars[Math.floor(Math.random() * chars.length)] : 'O'

    const newBoard = boardRows.map((row, y) => {
      const rowChars = row.split('')
      for (let x = 0; x < boardWidth; x++) {
        const patternY = y - startY
        const patternX = x - startX
        if (patternY >= 0 && patternY < patternHeight && patternX >= 0 && patternX < patternWidth) {
          const patternRow = patternRows[patternY] || ''
          const patternCell = patternRow[patternX] || ' '
          if (patternCell !== ' ') {
            rowChars[x] = patternChar
          }
        }
      }
      return rowChars.join('')
    })

    setGeneration(newBoard.join('\n'))
    setError(null)
  }, [generation, cellCharacters])

  const generateRandomBoard = useCallback(() => {
    const rows = []
    const chars = cellCharacters.split('').filter(c => c !== ' ')

    for (let i = 0; i < dimensions.height; i++) {
      let row = ""
      for (let j = 0; j < dimensions.width; j++) {
        if (Math.random() < density) {
          // Randomly select one of the provided characters
          const randomChar = chars[Math.floor(Math.random() * chars.length)]
          row += randomChar
        } else {
          row += " "
        }
      }
      rows.push(row)
    }
    return rows.join("\n")
  }, [dimensions, density, cellCharacters])

  const renderNewGeneration = async (board) => {
    try {
      if (!contractId) {
        setError("Contract ID not configured. Set VITE_CONTRACT_ID in your .env file.")
        setIsRunning(false)
        return null
      }
      if (!simulatorAddress) {
        setError("Simulator address not configured. Set VITE_SIMULATOR_ADDRESS in your .env file.")
        setIsRunning(false)
        return null
      }

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

      const sim = await rpcServer.simulateTransaction(tx)

      if (StellarRpc.Api.isSimulationError(sim)) {
        const errorMsg = sim.error || 'Unknown simulation error'
        if (errorMsg.includes('Budget') || errorMsg.includes('ExceededLimit')) {
          throw new Error('Board too large - exceeded smart contract resource limits. Try a smaller board size.')
        }
        if (errorMsg.includes('memory')) {
          throw new Error('Board too large - exceeded smart contract memory limits. Try a smaller board size.')
        }
        throw new Error(`Contract error: ${errorMsg}`)
      }

      const result = sim.result?.retval
      if (result) {
        const nextBoard = scValToNative(result)
        setGenerationCount(prev => prev + 1)
        return nextBoard
      }

      return null
    } catch (err) {
      console.error("Error calling contract:", err)
      setError(`Error rendering generation: ${err.message}`)
      setIsRunning(false)
      return null
    }
  }

  // Refs to access current values in animation loop without triggering re-renders
  const generationRef = useRef(generation);
  const animationSpeedRef = useRef(animationSpeed);

  useEffect(() => { generationRef.current = generation; }, [generation]);
  useEffect(() => { animationSpeedRef.current = animationSpeed; }, [animationSpeed]);

  useEffect(() => {
    let timeoutId;
    let isMounted = true;

    const runGeneration = async () => {
      if (!isRunning || !isMounted) return;

      const currentGen = generationRef.current;
      if (!currentGen) return;

      const startTime = performance.now();
      const nextGen = await renderNewGeneration(currentGen);
      const elapsed = performance.now() - startTime;

      if (!isMounted) return;

      if (nextGen === currentGen) {
        setIsRunning(false);
      } else if (nextGen) {
        setGeneration(nextGen);
        generationRef.current = nextGen;
        const remainingDelay = Math.max(0, animationSpeedRef.current - elapsed);
        timeoutId = setTimeout(runGeneration, remainingDelay);
      }
    };

    if (isRunning) {
      runGeneration();
    }

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isRunning]);

  useEffect(() => {
    setGeneration(generateRandomBoard())
  }, [])

  useEffect(() => {
    if (showSettings) {
      setGeneration(generateRandomBoard())
      setGenerationCount(0)
    }
  }, [dimensions.width, dimensions.height, density])

  const handleStart = () => {
    if (!generation) {
      setGeneration(generateRandomBoard())
    }
    setError(null)
    setIsRunning(true)
  }

  const handleReset = () => {
    setIsRunning(false)
    setGeneration(generateRandomBoard())
    setShowSettings(true)
    setGenerationCount(0)
    setError(null)
    setCellCharError(null)
    setCellCharInput(cellCharacters) // Reset input to last valid value
  }

  const handleRegenerate = () => {
    setGeneration(generateRandomBoard())
    setGenerationCount(0)
  }

  const handleStep = async () => {
    if (generation) {
      setError(null)
      const nextGen = await renderNewGeneration(generation)
      if (nextGen) {
        setGeneration(nextGen)
      }
    }
  }

  const toggleCell = (row, col) => {
    if (!generation || isRunning) return

    const rows = generation.split('\n')
    const rowChars = rows[row].split('')
    const currentCell = rowChars[col]

    if (currentCell === ' ') {
      rowChars[col] = selectedBrush || 'O'
    } else {
      rowChars[col] = ' '
    }

    rows[row] = rowChars.join('')
    setGeneration(rows.join('\n'))
  }

  const renderBoard = (board) => {
    if (!board) return null;
    const rows = board.split("\n");

    return (
      <div className="overflow-auto">
        <div
          className="board"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${rows[0].length}, 1rem)`,
            gridTemplateRows: `repeat(${rows.length}, 1rem)`,
            gap: '1px',
            margin: 'auto',
            minWidth: 'min-content',
            ...cellStyles
          }}
        >
          {rows.flatMap((row, i) =>
            Array.from(row).map((cell, j) => (
              <div
                key={`${i}-${j}`}
                className={`cell ${cell !== " " ? "cell-alive" : "cell-dead"}`}
                onClick={() => toggleCell(i, j)}
                style={{ cursor: isRunning ? 'default' : 'pointer' }}
              >
                {cell !== " " ? cell : " "}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const settingsJSX = (
    <div className="space-y-6 mb-6">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Board Size
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400">Width</label>
            <input
              type="number"
              value={dimensions.width}
              onChange={(e) => setDimensions(d => ({ ...d, width: parseInt(e.target.value) }))}
              className="input-number mt-1 block w-full"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Height</label>
            <input
              type="number"
              value={dimensions.height}
              onChange={(e) => setDimensions(d => ({ ...d, height: parseInt(e.target.value) }))}
              className="input-number mt-1 block w-full"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Initial Density ({Math.round(density * 100)}%)
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={density}
          onChange={(e) => setDensity(parseFloat(e.target.value))}
          className="input-range"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Animation Speed ({(animationSpeed / 1000).toFixed(1)}s)
        </label>
        <input
          type="range"
          min="50"
          max="10000"
          step="100"
          value={animationSpeed}
          onChange={(e) => setAnimationSpeed(parseInt(e.target.value))}
          className="input-range"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>Faster</span>
          <span>Slower</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Cell Color
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="color"
              value={cellColor}
              onChange={(e) => setCellColor(e.target.value)}
              className="h-10 w-20 rounded cursor-pointer bg-gray-700 border border-gray-600"
            />
            <span className="text-gray-400 text-sm">{cellColor}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Cell Characters
          </label>
          <input
            type="text"
            value={cellCharInput}
            onChange={handleCellCharactersChange}
            placeholder="e.g., OX or ABC"
            className={`input-number w-full ${cellCharError ? 'border-amber-500 focus:border-amber-500 focus:ring-amber-500' : ''}`}
          />
          {cellCharError ? (
            <div className="mt-2 flex items-start space-x-2 text-amber-400 bg-amber-900/30 border border-amber-500/50 rounded-md px-3 py-2">
              <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <span className="text-sm">{cellCharError}</span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-400">
              ASCII characters only (A-Z, 0-9, symbols). Space = dead cell.
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Drawing Brush
        </label>
        <p className="text-xs text-gray-500 mb-2">Click cells on the board to draw. Select which character to place:</p>
        <div className="flex flex-wrap gap-2">
          {cellCharacters.split('').filter(c => c !== ' ').map((char, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedBrush(char)}
              className={`w-10 h-10 rounded font-mono text-lg transition-all ${
                selectedBrush === char
                  ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              style={selectedBrush === char ? { color: cellColor } : {}}
            >
              {char}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Insert Pattern
        </label>
        <p className="text-xs text-gray-500 mb-2">Click to insert at a random location on the board</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESETS).map(([name, pattern]) => (
            <button
              key={name}
              onClick={() => insertPattern(pattern)}
              className="preset-btn"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <button
          onClick={handleRegenerate}
          disabled={!!cellCharError}
          className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowPathIcon className="h-5 w-5 mr-2" />
          Regenerate Random
        </button>
      </div>
    </div>
  )

  const cellStyles = {
    '--cell-color': cellColor,
  }

  return (
    <div className="min-h-screen bg-gray-900 py-8 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 min-w-fit">
        <h1 className="text-4xl font-bold mb-8 text-center text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-600">
          Conway's Game of Life
        </h1>
        <p className="text-center text-gray-400 mb-4">
          Powered by Stellar/Soroban Smart Contracts
        </p>

        <div className="max-w-2xl mx-auto mb-6 text-sm text-gray-400 bg-gray-800/50 rounded-lg px-4 py-3">
          <p className="mb-2">
            <span className="text-emerald-400 font-medium">Conway's Game of Life</span> is a cellular automaton where cells live or die based on their neighbors:
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-500">
            <li><span className="text-gray-400">Underpopulation:</span> Cells with &lt;2 neighbors die</li>
            <li><span className="text-gray-400">Survival:</span> Cells with 2-3 neighbors live</li>
            <li><span className="text-gray-400">Overpopulation:</span> Cells with &gt;3 neighbors die</li>
            <li><span className="text-gray-400">Reproduction:</span> Empty cells with exactly 3 neighbors come alive</li>
          </ul>
          <p className="mt-2 text-gray-500">
            Use multiple cell characters (e.g., "OX") to create competing colonies. New cells inherit the dominant neighbor type.
          </p>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="control-panel">
          {showSettings && settingsJSX}

          <div className="flex flex-col items-center space-y-6">
            <div className="text-lg font-semibold text-emerald-400">
              Generation: {generationCount}
            </div>
            <div className="w-fit flex justify-center p-4 bg-gray-800/50 rounded-lg">
              {renderBoard(generation)}
            </div>

            <div className="flex space-x-4">
              {!showSettings && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="btn-secondary"
                >
                  <AdjustmentsHorizontalIcon className="h-5 w-5 mr-2" />
                  Settings
                </button>
              )}

              <button
                onClick={() => isRunning ? setIsRunning(false) : handleStart()}
                disabled={!isRunning && !!cellCharError}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunning ? (
                  <>
                    <PauseIcon className="h-5 w-5 mr-2" />
                    Pause
                  </>
                ) : (
                  <>
                    <PlayIcon className="h-5 w-5 mr-2" />
                    Start
                  </>
                )}
              </button>

              <button
                onClick={handleStep}
                disabled={isRunning || !!cellCharError}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ForwardIcon className="h-5 w-5 mr-2" />
                Step
              </button>

              <button
                onClick={handleReset}
                className="btn-secondary"
              >
                <ArrowPathIcon className="h-5 w-5 mr-2" />
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
