use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Fee must not exceed 100% (10000 bps)")]
    InvalidFeeBps,
    #[msg("Bounty amount is below the 1 tUSDC minimum")]
    AmountTooLow,
    #[msg("Deadline must be between 60 seconds and 7 days from now")]
    InvalidDeadline,
    #[msg("Pick window must be between 60 seconds and 7 days")]
    InvalidPickWindow,
    #[msg("Mint does not match the configured tUSDC mint")]
    WrongMint,
    #[msg("Bounty is not open")]
    BountyNotOpen,
    #[msg("Submission deadline has passed")]
    DeadlinePassed,
    #[msg("Maximum number of entries reached")]
    TooManyEntries,
    #[msg("Only the buyer can pick a winner")]
    NotBuyer,
    #[msg("Picking is only allowed between the deadline and the pick deadline")]
    NotInPickWindow,
    #[msg("Entry does not belong to this bounty")]
    EntryBountyMismatch,
    #[msg("Only the platform admin can call this")]
    NotAdmin,
    #[msg("Auto-award is only allowed after the pick deadline")]
    PickWindowNotOver,
    #[msg("Refund before the deadline is not allowed")]
    DeadlineNotReached,
    #[msg("Buyer self-refund is only allowed when there are no entries")]
    EntriesExist,
    #[msg("Signer is neither the platform admin nor the bounty buyer")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
