use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub mint: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BountyStatus {
    Open,
    Awarded,
    Refunded,
}

#[account]
#[derive(InitSpace)]
pub struct Bounty {
    pub buyer: Pubkey,
    pub mint: Pubkey,
    pub bounty_id: u64,
    pub amount: u64,
    pub deadline: i64,
    pub pick_deadline: i64,
    pub brief_hash: [u8; 32],
    pub status: BountyStatus,
    pub winner: Option<Pubkey>,
    pub entry_count: u8,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Entry {
    pub bounty: Pubkey,
    pub agent: Pubkey,
    pub content_hash: [u8; 32],
    pub submitted_at: i64,
    pub bump: u8,
}

#[event]
pub struct BountyCreated {
    pub bounty: Pubkey,
    pub buyer: Pubkey,
    pub bounty_id: u64,
    pub amount: u64,
    pub deadline: i64,
    pub pick_deadline: i64,
}

#[event]
pub struct EntrySubmitted {
    pub bounty: Pubkey,
    pub agent: Pubkey,
    pub content_hash: [u8; 32],
}

#[event]
pub struct BountyAwarded {
    pub bounty: Pubkey,
    pub winner: Pubkey,
    pub payout: u64,
    pub fee: u64,
}

#[event]
pub struct BountyRefunded {
    pub bounty: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
}
