mod common;

use common::*;
use solana_signer::Signer;

#[test]
fn create_bounty_transfers_funds_into_the_vault() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let balance_before = token_balance(&env.svm, &env.buyer_ata);

    let (_bounty, vault) = create_test_bounty(&mut env, 1, amount);

    assert_eq!(token_balance(&env.svm, &vault), amount);
    assert_eq!(token_balance(&env.svm, &env.buyer_ata), balance_before - amount);
}

#[test]
fn three_entries_then_pick_winner_pays_correctly() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 1, amount);

    let entries: Vec<_> = (0..3u8).map(|i| submit_test_entry(&mut env, &bounty, i)).collect();

    // Past the deadline but still inside the pick window.
    advance_time(&mut env.svm, 121);

    let (winning_agent, winner_entry) = &entries[1];
    let winner_ata = create_ata(&mut env.svm, &env.buyer, &winning_agent.pubkey(), &env.mint);

    let ix = ix_pick_winner(
        &env.buyer.pubkey(),
        &env.config,
        &bounty,
        &vault,
        winner_entry,
        &winning_agent.pubkey(),
        &winner_ata,
        &env.treasury_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert!(res.is_ok(), "pick_winner failed: {res:?}");

    let fee = amount * FEE_BPS as u64 / 10_000;
    let payout = amount - fee;
    assert_eq!(token_balance(&env.svm, &winner_ata), payout);
    assert_eq!(token_balance(&env.svm, &env.treasury_ata), fee);
    assert_eq!(token_balance(&env.svm, &vault), 0);
}

#[test]
fn auto_award_path() {
    let mut env = setup();
    let amount = 20 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 2, amount);
    let (agent, entry) = submit_test_entry(&mut env, &bounty, 9);

    // Past the pick deadline too.
    advance_time(&mut env.svm, 241);

    let winner_ata = create_ata(&mut env.svm, &env.admin, &agent.pubkey(), &env.mint);
    let ix = ix_auto_award(
        &env.admin.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &entry,
        &agent.pubkey(),
        &winner_ata,
        &env.treasury_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &env.admin, &[&env.admin], &[ix]);
    assert!(res.is_ok(), "auto_award failed: {res:?}");

    let fee = amount * FEE_BPS as u64 / 10_000;
    let payout = amount - fee;
    assert_eq!(token_balance(&env.svm, &winner_ata), payout);
    assert_eq!(token_balance(&env.svm, &env.treasury_ata), fee);
}

#[test]
fn admin_refund_path() {
    let mut env = setup();
    let amount = 5 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 3, amount);

    // Even with an entry present, the admin can still force a refund once
    // the deadline has passed (e.g. the referee failed every entry).
    submit_test_entry(&mut env, &bounty, 7);
    advance_time(&mut env.svm, 121);

    let balance_before = token_balance(&env.svm, &env.buyer_ata);
    let ix = ix_refund(
        &env.admin.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &env.buyer_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &env.admin, &[&env.admin], &[ix]);
    assert!(res.is_ok(), "admin refund failed: {res:?}");

    assert_eq!(token_balance(&env.svm, &env.buyer_ata), balance_before + amount);
    assert_eq!(token_balance(&env.svm, &vault), 0);
}

#[test]
fn buyer_self_refund_with_zero_entries() {
    let mut env = setup();
    let amount = 3 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 4, amount);

    advance_time(&mut env.svm, 121);

    let balance_before = token_balance(&env.svm, &env.buyer_ata);
    let ix = ix_refund(
        &env.buyer.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &env.buyer_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert!(res.is_ok(), "buyer self-refund failed: {res:?}");

    assert_eq!(token_balance(&env.svm, &env.buyer_ata), balance_before + amount);
    assert_eq!(token_balance(&env.svm, &vault), 0);
}
