use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    errors::EscrowError,
    state::{Bounty, BountyRefunded, BountyStatus, Config},
};

#[derive(Accounts)]
pub struct Refund<'info> {
    pub signer: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [BOUNTY_SEED, bounty.buyer.as_ref(), &bounty.bounty_id.to_le_bytes()],
        bump = bounty.bump,
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        mut,
        seeds = [VAULT_SEED, bounty.key().as_ref()],
        bump = bounty.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = bounty.buyer,
    )]
    pub buyer_ata: Account<'info, TokenAccount>,

    #[account(address = config.mint @ EscrowError::WrongMint)]
    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_refund(ctx: Context<Refund>) -> Result<()> {
    require!(
        ctx.accounts.bounty.status == BountyStatus::Open,
        EscrowError::BountyNotOpen
    );

    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= ctx.accounts.bounty.deadline,
        EscrowError::DeadlineNotReached
    );

    let signer_key = ctx.accounts.signer.key();
    if signer_key == ctx.accounts.config.admin {
        // Admin can always refund an open, past-deadline bounty.
    } else if signer_key == ctx.accounts.bounty.buyer {
        require!(
            ctx.accounts.bounty.entry_count == 0,
            EscrowError::EntriesExist
        );
    } else {
        return err!(EscrowError::Unauthorized);
    }

    let buyer_key = ctx.accounts.bounty.buyer;
    let bounty_id_bytes = ctx.accounts.bounty.bounty_id.to_le_bytes();
    let bump = ctx.accounts.bounty.bump;
    let signer_seeds: &[&[&[u8]]] =
        &[&[BOUNTY_SEED, buyer_key.as_ref(), &bounty_id_bytes, &[bump]]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.buyer_ata.to_account_info(),
        authority: ctx.accounts.bounty.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    );
    token::transfer(cpi_ctx, ctx.accounts.bounty.amount)?;

    let amount = ctx.accounts.bounty.amount;
    let bounty = &mut ctx.accounts.bounty;
    bounty.status = BountyStatus::Refunded;

    emit!(BountyRefunded {
        bounty: bounty.key(),
        buyer: bounty.buyer,
        amount,
    });

    Ok(())
}
