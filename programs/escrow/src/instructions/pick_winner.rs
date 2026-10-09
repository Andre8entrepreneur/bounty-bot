use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    constants::*,
    errors::EscrowError,
    instructions::shared::{compute_fee_and_payout, transfer_payout},
    state::{Bounty, BountyAwarded, BountyStatus, Config, Entry},
};

#[derive(Accounts)]
pub struct PickWinner<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        has_one = buyer @ EscrowError::NotBuyer,
        seeds = [BOUNTY_SEED, bounty.buyer.as_ref(), &bounty.bounty_id.to_le_bytes()],
        bump = bounty.bump,
    )]
    pub bounty: Box<Account<'info, Bounty>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, bounty.key().as_ref()],
        bump = bounty.vault_bump,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    #[account(has_one = bounty @ EscrowError::EntryBountyMismatch)]
    pub winner_entry: Box<Account<'info, Entry>>,

    /// CHECK: identity verified against `winner_entry.agent` below; only used
    /// as the authority for (optionally creating) the winner's ATA.
    #[account(address = winner_entry.agent)]
    pub agent: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = agent,
    )]
    pub winner_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = config.treasury,
    )]
    pub treasury_ata: Box<Account<'info, TokenAccount>>,

    #[account(address = config.mint @ EscrowError::WrongMint)]
    pub mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_pick_winner(ctx: Context<PickWinner>) -> Result<()> {
    require!(
        ctx.accounts.bounty.status == BountyStatus::Open,
        EscrowError::BountyNotOpen
    );

    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= ctx.accounts.bounty.deadline && now < ctx.accounts.bounty.pick_deadline,
        EscrowError::NotInPickWindow
    );

    let (fee, payout) =
        compute_fee_and_payout(ctx.accounts.bounty.amount, ctx.accounts.config.fee_bps)?;

    let buyer_key = ctx.accounts.bounty.buyer;
    let bounty_id_bytes = ctx.accounts.bounty.bounty_id.to_le_bytes();
    let bump = ctx.accounts.bounty.bump;
    let signer_seeds: &[&[u8]] = &[BOUNTY_SEED, buyer_key.as_ref(), &bounty_id_bytes, &[bump]];

    transfer_payout(
        &ctx.accounts.token_program,
        &ctx.accounts.vault,
        &ctx.accounts.bounty.to_account_info(),
        signer_seeds,
        &ctx.accounts.treasury_ata,
        &ctx.accounts.winner_ata,
        fee,
        payout,
    )?;

    let winner = ctx.accounts.winner_entry.agent;
    let bounty = &mut ctx.accounts.bounty;
    bounty.status = BountyStatus::Awarded;
    bounty.winner = Some(winner);

    emit!(BountyAwarded {
        bounty: bounty.key(),
        winner,
        payout,
        fee,
    });

    Ok(())
}
