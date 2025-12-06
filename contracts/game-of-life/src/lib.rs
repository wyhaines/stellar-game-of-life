#![no_std]
use soroban_sdk::{contract, contractimpl, Bytes, Env, String};

const MAX_BOARD_SIZE: usize = 100_000;

/// Returns (neighbor_count, array of neighbor cell types, count of types)
fn get_neighbor_info(grid: &[u8], x: i32, y: i32, width: usize, height: usize) -> (u32, [u8; 8], usize) {
    let mut types = [0u8; 8];
    let mut count = 0usize;

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
                    types[count] = cell;
                    count += 1;
                }
            }
        }
    }

    (count as u32, types, count)
}

/// Returns the most common cell type among neighbors. Ties are broken randomly.
fn get_dominant_type(env: &Env, types: &[u8], type_count: usize) -> u8 {
    if type_count == 0 {
        return b'O';
    }
    if type_count == 1 {
        return types[0];
    }

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

    let mut max_count = 0u32;
    for i in 0..unique_count {
        if counts[i].1 > max_count {
            max_count = counts[i].1;
        }
    }

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

    let index = env.prng().gen_range::<u64>(0..winner_count as u64) as usize;
    winners[index]
}

#[contract]
pub struct GameOfLife;

#[contractimpl]
impl GameOfLife {
    /// Computes the next generation of Conway's Game of Life.
    /// Board format: rows separated by newlines, space = dead, any other char = alive.
    /// Newly born cells inherit the dominant neighbor type; ties are broken randomly.
    pub fn next_generation(env: Env, board: String) -> String {
        let len = board.len() as usize;
        if len == 0 || len > MAX_BOARD_SIZE {
            return board;
        }

        let mut buffer = [0u8; MAX_BOARD_SIZE];
        board.copy_into_slice(&mut buffer[..len]);
        let input = &buffer[..len];

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
        if current_width > 0 {
            if width == 0 {
                width = current_width;
            }
            height += 1;
        }

        if width == 0 || height == 0 {
            return board;
        }

        let mut grid = [0u8; MAX_BOARD_SIZE];
        let mut idx = 0usize;
        for &b in input.iter() {
            if b != b'\n' {
                grid[idx] = b;
                idx += 1;
            }
        }

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
                        result.push_back(current_char);
                    } else {
                        let new_type =
                            get_dominant_type(&env, &neighbor_types[..type_count], type_count);
                        result.push_back(new_type);
                    }
                } else {
                    result.push_back(b' ');
                }
            }
        }

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

    fn setup() -> (Env, GameOfLifeClient<'static>) {
        let env = Env::default();
        let contract_id = env.register_contract(None, GameOfLife);
        let client = GameOfLifeClient::new(&env, &contract_id);
        (env, client)
    }

    #[test]
    fn test_empty_board() {
        let (env, client) = setup();
        let board = String::from_str(&env, "     \n     \n     ");
        assert_eq!(client.next_generation(&board), board);
    }

    #[test]
    fn test_block_still_life() {
        let (env, client) = setup();
        let board = String::from_str(&env, "    \n OO \n OO \n    ");
        assert_eq!(client.next_generation(&board), board);
    }

    #[test]
    fn test_blinker_oscillator() {
        let (env, client) = setup();
        let horizontal = String::from_str(&env, "     \n     \n OOO \n     \n     ");
        let vertical = String::from_str(&env, "     \n  O  \n  O  \n  O  \n     ");

        assert_eq!(client.next_generation(&horizontal), vertical);
        assert_eq!(client.next_generation(&vertical), horizontal);
    }

    #[test]
    fn test_single_cell_dies() {
        let (env, client) = setup();
        let board = String::from_str(&env, "   \n O \n   ");
        let expected = String::from_str(&env, "   \n   \n   ");
        assert_eq!(client.next_generation(&board), expected);
    }

    #[test]
    fn test_overcrowding() {
        let (env, client) = setup();
        let board = String::from_str(&env, "OOO\nOOO\nOOO");
        let expected = String::from_str(&env, "O O\n   \nO O");
        assert_eq!(client.next_generation(&board), expected);
    }

    #[test]
    fn test_birth() {
        let (env, client) = setup();
        let board = String::from_str(&env, "    \n O  \n OO \n    ");
        let expected = String::from_str(&env, "    \n OO \n OO \n    ");
        assert_eq!(client.next_generation(&board), expected);
    }

    #[test]
    fn test_dominant_type_clear_winner() {
        let (env, client) = setup();
        // Two X neighbors vs one O neighbor - new cell should be X
        let board = String::from_str(&env, "   \n X \nX O\n   ");
        let expected = String::from_str(&env, "   \n X \n X \n   ");
        assert_eq!(client.next_generation(&board), expected);
    }

    #[test]
    fn test_mixed_types_block_survives() {
        let (env, client) = setup();
        let board = String::from_str(&env, "    \n XO \n OX \n    ");
        assert_eq!(client.next_generation(&board), board);
    }

    #[test]
    fn test_same_type_blinker() {
        let (env, client) = setup();
        let board = String::from_str(&env, "     \n     \n XXX \n     \n     ");
        let expected = String::from_str(&env, "     \n  X  \n  X  \n  X  \n     ");
        assert_eq!(client.next_generation(&board), expected);
    }

    #[test]
    fn test_birth_inherits_neighbor_type() {
        let (env, client) = setup();
        let board = String::from_str(&env, "     \n     \n YYY \n     \n     ");
        let expected = String::from_str(&env, "     \n  Y  \n  Y  \n  Y  \n     ");
        assert_eq!(client.next_generation(&board), expected);
    }
}
