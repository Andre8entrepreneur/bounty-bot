use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{constants::*, errors::EscrowError, state::Config};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub deployer: Signer<'info>,

    #[account(
        init,
        payer = deployer,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: stored only as a pubkey — the platform authority that will later
    /// sign `auto_award`/`refund`. Any address is valid here; it's a one-time
    /// setup choice, not something this instruction needs to validate.
    pub admin: UncheckedAccount<'info>,

    /// CHECK: stored only as a pubkey — the owner of the fee token account.
    /// Its ATA is derived (not created) wherever it's used later.
    pub treasury: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(ctx: Context<InitializeConfig>, fee_bps: u16) -> Result<()> {
    require!(fee_bps <= MAX_FEE_BPS, EscrowError::InvalidFeeBps);

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.treasury = ctx.accounts.treasury.key();
    config.mint = ctx.accounts.mint.key();
    config.fee_bps = fee_bps;
    config.bump = ctx.bumps.config;

    Ok(())
}
