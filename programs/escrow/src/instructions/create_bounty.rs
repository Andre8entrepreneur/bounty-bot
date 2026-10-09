use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    errors::EscrowError,
    state::{Bounty, BountyCreated, BountyStatus, Config},
};

#[derive(Accounts)]
#[instruction(bounty_id: u64)]
pub struct CreateBounty<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = buyer,
        space = 8 + Bounty::INIT_SPACE,
        seeds = [BOUNTY_SEED, buyer.key().as_ref(), &bounty_id.to_le_bytes()],
        bump,
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        init,
        payer = buyer,
        seeds = [VAULT_SEED, bounty.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = bounty,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(address = config.mint @ EscrowError::WrongMint)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = buyer,
    )]
    pub buyer_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_create_bounty(
    ctx: Context<CreateBounty>,
    bounty_id: u64,
    amount: u64,
    deadline: i64,
    pick_window_secs: i64,
    brief_hash: [u8; 32],
) -> Result<()> {
    require!(amount >= MIN_BOUNTY_AMOUNT, EscrowError::AmountTooLow);

    let now = Clock::get()?.unix_timestamp;
    require!(
        deadline >= now + MIN_DEADLINE_SECS && deadline <= now + MAX_DEADLINE_SECS,
        EscrowError::InvalidDeadline
    );
    require!(
        pick_window_secs >= MIN_PICK_WINDOW_SECS && pick_window_secs <= MAX_PICK_WINDOW_SECS,
        EscrowError::InvalidPickWindow
    );
    let pick_deadline = deadline
        .checked_add(pick_window_secs)
        .ok_or(EscrowError::InvalidPickWindow)?;

    let bounty = &mut ctx.accounts.bounty;
    bounty.buyer = ctx.accounts.buyer.key();
    bounty.mint = ctx.accounts.mint.key();
    bounty.bounty_id = bounty_id;
    bounty.amount = amount;
    bounty.deadline = deadline;
    bounty.pick_deadline = pick_deadline;
    bounty.brief_hash = brief_hash;
    bounty.status = BountyStatus::Open;
    bounty.winner = None;
    bounty.entry_count = 0;
    bounty.bump = ctx.bumps.bounty;
    bounty.vault_bump = ctx.bumps.vault;

    let cpi_accounts = Transfer {
        from: ctx.accounts.buyer_ata.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.buyer.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    emit!(BountyCreated {
        bounty: ctx.accounts.bounty.key(),
        buyer: ctx.accounts.bounty.buyer,
        bounty_id,
        amount,
        deadline,
        pick_deadline,
    });

    Ok(())
}
