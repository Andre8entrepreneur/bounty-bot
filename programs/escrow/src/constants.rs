pub const CONFIG_SEED: &[u8] = b"config";
pub const BOUNTY_SEED: &[u8] = b"bounty";
pub const VAULT_SEED: &[u8] = b"vault";
pub const ENTRY_SEED: &[u8] = b"entry";

pub const MIN_BOUNTY_AMOUNT: u64 = 1_000_000; // 1 tUSDC at 6 decimals
pub const MIN_DEADLINE_SECS: i64 = 60;
pub const MAX_DEADLINE_SECS: i64 = 7 * 24 * 60 * 60;
pub const MIN_PICK_WINDOW_SECS: i64 = 60;
pub const MAX_PICK_WINDOW_SECS: i64 = 7 * 24 * 60 * 60;
pub const MAX_ENTRIES: u8 = 10;
pub const MAX_FEE_BPS: u16 = 10_000;
pub const FEE_BPS_DENOMINATOR: u128 = 10_000;
