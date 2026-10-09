use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{constants::FEE_BPS_DENOMINATOR, errors::EscrowError};

/// Splits `amount` into (fee, payout) using u128 math so the multiply can't
/// silently wrap before the division narrows it back to u64.
pub fn compute_fee_and_payout(amount: u64, fee_bps: u16) -> Result<(u64, u64)> {
    let fee_u128 = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(EscrowError::MathOverflow)?
        .checked_div(FEE_BPS_DENOMINATOR)
        .ok_or(EscrowError::MathOverflow)?;
    let fee = u64::try_from(fee_u128).map_err(|_| EscrowError::MathOverflow)?;
    let payout = amount.checked_sub(fee).ok_or(EscrowError::MathOverflow)?;
    Ok((fee, payout))
}

/// Pays `fee` to the treasury and `payout` to the winner, both from `vault`,
/// signed by the Bounty PDA (the vault's token authority). Shared by
/// `pick_winner` and `auto_award` — the only payout path in the program.
#[allow(clippy::too_many_arguments)]
pub fn transfer_payout<'info>(
    token_program: &Program<'info, Token>,
    vault: &Account<'info, TokenAccount>,
    bounty_info: &AccountInfo<'info>,
    bounty_signer_seeds: &[&[u8]],
    treasury_ata: &Account<'info, TokenAccount>,
    winner_ata: &Account<'info, TokenAccount>,
    fee: u64,
    payout: u64,
) -> Result<()> {
    let signer_seeds: &[&[&[u8]]] = &[bounty_signer_seeds];

    if fee > 0 {
        let cpi_accounts = Transfer {
            from: vault.to_account_info(),
            to: treasury_ata.to_account_info(),
            authority: bounty_info.clone(),
        };
        let cpi_ctx = CpiContext::new_with_signer(token_program.key(), cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, fee)?;
    }

    let cpi_accounts = Transfer {
        from: vault.to_account_info(),
        to: winner_ata.to_account_info(),
        authority: bounty_info.clone(),
    };
    let cpi_ctx = CpiContext::new_with_signer(token_program.key(), cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, payout)?;

    Ok(())
}
