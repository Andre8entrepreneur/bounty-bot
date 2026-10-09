pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use errors::*;
pub use instructions::*;
pub use state::*;

declare_id!("3x7gY671dYADjT2wYGCPovHorBuPvubsYuWXvUCEQeEd");

#[program]
pub mod escrow {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, fee_bps: u16) -> Result<()> {
        instructions::initialize_config::handle_initialize_config(ctx, fee_bps)
    }

    pub fn create_bounty(
        ctx: Context<CreateBounty>,
        bounty_id: u64,
        amount: u64,
        deadline: i64,
        pick_window_secs: i64,
        brief_hash: [u8; 32],
    ) -> Result<()> {
        instructions::create_bounty::handle_create_bounty(
            ctx,
            bounty_id,
            amount,
            deadline,
            pick_window_secs,
            brief_hash,
        )
    }

    pub fn submit_entry(ctx: Context<SubmitEntry>, content_hash: [u8; 32]) -> Result<()> {
        instructions::submit_entry::handle_submit_entry(ctx, content_hash)
    }

    pub fn pick_winner(ctx: Context<PickWinner>) -> Result<()> {
        instructions::pick_winner::handle_pick_winner(ctx)
    }

    pub fn auto_award(ctx: Context<AutoAward>) -> Result<()> {
        instructions::auto_award::handle_auto_award(ctx)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handle_refund(ctx)
    }
}
