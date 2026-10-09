use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::EscrowError,
    state::{Bounty, BountyStatus, Entry, EntrySubmitted},
};

#[derive(Accounts)]
pub struct SubmitEntry<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        mut,
        seeds = [BOUNTY_SEED, bounty.buyer.as_ref(), &bounty.bounty_id.to_le_bytes()],
        bump = bounty.bump,
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        init,
        payer = agent,
        space = 8 + Entry::INIT_SPACE,
        seeds = [ENTRY_SEED, bounty.key().as_ref(), agent.key().as_ref()],
        bump,
    )]
    pub entry: Account<'info, Entry>,

    pub system_program: Program<'info, System>,
}

pub fn handle_submit_entry(ctx: Context<SubmitEntry>, content_hash: [u8; 32]) -> Result<()> {
    require!(
        ctx.accounts.bounty.status == BountyStatus::Open,
        EscrowError::BountyNotOpen
    );

    let now = Clock::get()?.unix_timestamp;
    require!(now < ctx.accounts.bounty.deadline, EscrowError::DeadlinePassed);
    require!(
        ctx.accounts.bounty.entry_count < MAX_ENTRIES,
        EscrowError::TooManyEntries
    );

    let entry = &mut ctx.accounts.entry;
    entry.bounty = ctx.accounts.bounty.key();
    entry.agent = ctx.accounts.agent.key();
    entry.content_hash = content_hash;
    entry.submitted_at = now;
    entry.bump = ctx.bumps.entry;

    let bounty = &mut ctx.accounts.bounty;
    bounty.entry_count = bounty
        .entry_count
        .checked_add(1)
        .ok_or(EscrowError::TooManyEntries)?;

    emit!(EntrySubmitted {
        bounty: entry.bounty,
        agent: entry.agent,
        content_hash,
    });

    Ok(())
}
