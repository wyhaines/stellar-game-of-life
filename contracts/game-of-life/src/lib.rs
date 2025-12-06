#![no_std]
use soroban_sdk::{contract, contractimpl, Bytes, Env, String};

// Large buffer size - execution environment resource limits (CPU instructions,
// memory) will typically constrain board size before this limit is reached
const MAX_BOARD_SIZE: usize = 100_000; // Supports ~316x316 grid

/// Get neighbor information: count and types of live neighbors
/// Returns (neighbor_count, array of neighbor cell types, number of types)
fn get_neighbor_info(
    grid: &[u8],
    x: i32,
    y: i32,
    width: usize,
    height: usize,
) -> (u32, [u8; 8], usize) {
    let mut count = 0u32;
    let mut types = [0u8; 8];
    let mut type_count = 0usize;

    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }

            let nx = x + dx;
            let ny = y + dy;

            if nx >= 0 && nx < width as i32 && ny >= 0 && ny < height as i32 {
                let cell = grid[(ny as usize) * width + (nx as usize)];
                if cell != b' ' {
                    types[type_count] = cell;
                    type_count += 1;
                    count += 1;
                }
            }
        }
    }

    (count, types, type_count)
}

/// Determine the dominant cell type among neighbors
/// For ties, use Soroban's PRNG for random selection
fn get_dominant_type(env: &Env, types: &[u8], type_count: usize) -> u8 {
    if type_count == 0 {
        return b'O'; // Fallback (shouldn't happen for birth)
    }

    if type_count == 1 {
        return types[0];
    }

    // Count occurrences of each type (max 8 neighbors, so small array is fine)
    let mut counts: [(u8, u32); 8] = [(0, 0); 8];
    let mut unique_count = 0usize;

    for i in 0..type_count {
        let t = types[i];
        let mut found = false;
        for j in 0..unique_count {
            if counts[j].0 == t {
                counts[j].1 += 1;
                found = true;
                break;
            }
        }
        if !found {
            counts[unique_count] = (t, 1);
            unique_count += 1;
        }
    }

    // Find maximum count
    let mut max_count = 0u32;
    for i in 0..unique_count {
        if counts[i].1 > max_count {
            max_count = counts[i].1;
        }
    }

    // Collect all types with max count (potential ties)
    let mut winners: [u8; 8] = [0; 8];
    let mut winner_count = 0usize;
    for i in 0..unique_count {
        if counts[i].1 == max_count {
            winners[winner_count] = counts[i].0;
            winner_count += 1;
        }
    }

    if winner_count == 1 {
        return winners[0];
    }

    // Tie-breaker: use Soroban's PRNG for random selection
    let index = env.prng().gen_range::<u64>(0..winner_count as u64) as usize;
    winners[index]
}

#[contract]
pub struct GameOfLife;

#[contractimpl]
impl GameOfLife {
    /// Calculate next generation of Conway's Game of Life
    /// Board format: rows separated by newlines, space = dead, any other char = alive
    ///
    /// Multi-colony support: newly born cells inherit the dominant cell type
    /// from their neighbors. Ties are resolved randomly.
    pub fn next_generation(env: Env, board: String) -> String {
        let len = board.len() as usize;
        if len == 0 || len > MAX_BOARD_SIZE {
            return board;
        }

        // Copy string bytes into a fixed buffer
        let mut buffer = [0u8; MAX_BOARD_SIZE];
        board.copy_into_slice(&mut buffer[..len]);
        let input = &buffer[..len];

        // Parse dimensions
        let mut width: usize = 0;
        let mut height: usize = 0;
        let mut current_width: usize = 0;

        for &b in input.iter() {
            if b == b'\n' {
                if width == 0 {
                    width = current_width;
                }
                height += 1;
                current_width = 0;
            } else {
                current_width += 1;
            }
        }
        // Account for last row if no trailing newline
        if current_width > 0 {
            if width == 0 {
                width = current_width;
            }
            height += 1;
        }

        if width == 0 || height == 0 {
            return board;
        }

        // Build the grid as a flat array for efficient access
        // grid[y * width + x] = cell value
        let mut grid = [0u8; MAX_BOARD_SIZE];
        let mut idx = 0usize;
        for &b in input.iter() {
            if b != b'\n' {
                grid[idx] = b;
                idx += 1;
            }
        }

        // Build next generation
        let mut result = Bytes::new(&env);

        for y in 0..height {
            if y > 0 {
                result.push_back(b'\n');
            }
            for x in 0..width {
                let current_char = grid[y * width + x];
                let cell_alive = current_char != b' ';
                let (neighbors, neighbor_types, type_count) =
                    get_neighbor_info(&grid, x as i32, y as i32, width, height);

                let next_alive = if cell_alive {
                    neighbors == 2 || neighbors == 3
                } else {
                    neighbors == 3
                };

                if next_alive {
                    if cell_alive {
                        // Survivor keeps its type
                        result.push_back(current_char);
                    } else {
                        // Birth: inherit dominant neighbor type (random on ties)
                        let new_type =
                            get_dominant_type(&env, &neighbor_types[..type_count], type_count);
                        result.push_back(new_type);
                    }
                } else {
                    result.push_back(b' ');
                }
            }
        }

        // Convert Bytes to String
        let result_len = result.len() as usize;
        let mut result_buffer = [0u8; MAX_BOARD_SIZE];
        result.copy_into_slice(&mut result_buffer[..result_len]);
        String::from_bytes(&env, &result_buffer[..result_len])
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn test_empty_board() {
        let env = Env::default();
        let contract_id = env.register_contract(None, GameOfLife);
        let client = GameOfLifeClient::new(&env, &contract_id);

        let board = String::from_str(&env, "     \n     \n     ");
        let next = client.next_generation(&board);
        assert_eq!(next, board);
    }

    #[test]
    fn test_block_still_life() {
        let env = Env::default();
        let contract_id = env.register_contract(None, GameOfLife);
        let client = GameOfLifeClient::new(&env, &contract_id);

        // Block pattern - stable
        let board = String::from_str(&env, "    \n OO \n OO \n    ");
        let next = client.next_generation(&board);
        assert_eq!(next, board);
    }

    #[test]
    fn test_blinker_oscillator() {
        let env = Env::default();
        let contract_id = env.register_contract(None, GameOfLife);
        let client = GameOfLifeClient::new(&env, &contract_id);

        // Horizontal blinker
        let board = String::from_str(&env, "     \n     \n OOO \n     \n     ");
        let next = client.next_generation(&board);

        // Should become vertical blinker
        let expected = String::from_str(&env, "     \n  O  \n  O  \n  O  \n     ");
        assert_eq!(next, expected);

        // And back to horizontal
        let next2 = client.next_generation(&next);
        assert_eq!(next2, board);
    }

    #[test]
    fn test_single_cell_dies() {
        let env = Env::default();
        let contract_id = env.register_contract(None, GameOfLife);
        let client = GameOfLifeClient::new(&env, &contract_id);

        // Single cell dies from underpopulation
        let board = String::from_str(&env, "   \n O \n   ");
        let next = client.next_generation(&board);
        let expected = String::from_str(&env, "   \n   \n   ");
        assert_eq!(next, expected);
    }

    #[test]
    fn test_overcrowding() {
        let env = Env::default();
        let contract_id = env.register_contract(None, GameOfLife);
        let client = GameOfLifeClient::new(&env, &contract_id);

        // Center cell has 8 neighbors - dies from overcrowding
        let board = String::from_str(&env, "OOO\nOOO\nOOO");
        let next = client.next_generation(&board);

        // Corners survive (3 neighbors), edges die (5 neighbors), center dies (8 neighbors)
        let expected = String::from_str(&env, "O O\n   \nO O");
        assert_eq!(next, expected);
    }

    #[test]
    fn test_birth() {
        let env = Env::default();
        let contract_id = env.register_contract(None, GameOfLife);
        let client = GameOfLifeClient::new(&env, &contract_id);

        // Three cells in L-shape - center should be born
        let board = String::from_str(&env, "    \n O  \n OO \n    ");
        let next = client.next_generation(&board);

        // All original cells survive (2 neighbors each), and (1,1) is born (3 neighbors)
        let expected = String::from_str(&env, "    \n OO \n OO \n    ");
        assert_eq!(next, expected);
    }

    // Multi-colony tests

    #[test]
    fn test_dominant_type_clear_winner() {
        let env = Env::default();
        let contract_id = env.register_contract(None, GameOfLife);
        let client = GameOfLifeClient::new(&env, &contract_id);

        // Two X neighbors and one O neighbor - new cell should be X
        // Layout:
        //   X
        //  X O
        //
        let board = String::from_str(&env, "   \n X \nX O\n   ");
        let next = client.next_generation(&board);

        // The cell at (1,2) should be born as X (2 X neighbors vs 1 O)
        // X at (1,1) survives (2 neighbors)
        // X at (0,2) dies (1 neighbor)
        // O at (2,2) dies (1 neighbor)
        // New X born at (1,2) with 2 X neighbors
        let expected = String::from_str(&env, "   \n X \n X \n   ");
        assert_eq!(next, expected);
    }

    #[test]
    fn test_mixed_types_block_survives() {
        let env = Env::default();
        let contract_id = env.register_contract(None, GameOfLife);
        let client = GameOfLifeClient::new(&env, &contract_id);

        // Mixed type block should preserve original types
        let board = String::from_str(&env, "    \n XO \n OX \n    ");
        let next = client.next_generation(&board);

        // All cells have exactly 3 neighbors, so all survive with original types
        assert_eq!(next, board);
    }

    #[test]
    fn test_same_type_blinker() {
        let env = Env::default();
        let contract_id = env.register_contract(None, GameOfLife);
        let client = GameOfLifeClient::new(&env, &contract_id);

        // X-only blinker should produce X-only vertical blinker
        let board = String::from_str(&env, "     \n     \n XXX \n     \n     ");
        let next = client.next_generation(&board);

        // New cells should be X (all neighbors are X)
        let expected = String::from_str(&env, "     \n  X  \n  X  \n  X  \n     ");
        assert_eq!(next, expected);
    }

    #[test]
    fn test_birth_inherits_neighbor_type() {
        let env = Env::default();
        let contract_id = env.register_contract(None, GameOfLife);
        let client = GameOfLifeClient::new(&env, &contract_id);

        // Three Y cells in a row - new cells should be Y
        let board = String::from_str(&env, "     \n     \n YYY \n     \n     ");
        let next = client.next_generation(&board);

        // Vertical blinker of Y cells
        let expected = String::from_str(&env, "     \n  Y  \n  Y  \n  Y  \n     ");
        assert_eq!(next, expected);
    }
}
