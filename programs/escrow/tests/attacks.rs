mod common;

use common::*;
use solana_keypair::Keypair;
use solana_program_pack::Pack;
use solana_signer::Signer;

#[test]
fn non_buyer_cannot_pick_winner() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 1, amount);
    let (agent, entry) = submit_test_entry(&mut env, &bounty, 1);
    advance_time(&mut env.svm, 121);

    let imposter = Keypair::new();
    env.svm.airdrop(&imposter.pubkey(), 10_000_000_000).unwrap();
    let winner_ata = create_ata(&mut env.svm, &env.buyer, &agent.pubkey(), &env.mint);

    let ix = ix_pick_winner(
        &imposter.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &entry,
        &agent.pubkey(),
        &winner_ata,
        &env.treasury_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &imposter, &[&imposter], &[ix]);
    assert_err_code(&res, EscrowError::NotBuyer);
}

#[test]
fn pick_winner_before_deadline() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 1, amount);
    let (agent, entry) = submit_test_entry(&mut env, &bounty, 1);
    // No advance_time: still before the deadline.

    let winner_ata = create_ata(&mut env.svm, &env.buyer, &agent.pubkey(), &env.mint);
    let ix = ix_pick_winner(
        &env.buyer.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &entry,
        &agent.pubkey(),
        &winner_ata,
        &env.treasury_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert_err_code(&res, EscrowError::NotInPickWindow);
}

#[test]
fn pick_winner_after_pick_deadline() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 1, amount);
    let (agent, entry) = submit_test_entry(&mut env, &bounty, 1);
    // deadline=+120, pick_window=120s -> pick_deadline=+240.
    advance_time(&mut env.svm, 241);

    let winner_ata = create_ata(&mut env.svm, &env.buyer, &agent.pubkey(), &env.mint);
    let ix = ix_pick_winner(
        &env.buyer.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &entry,
        &agent.pubkey(),
        &winner_ata,
        &env.treasury_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert_err_code(&res, EscrowError::NotInPickWindow);
}

#[test]
fn winner_entry_from_another_bounty_is_rejected() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty_a, vault_a) = create_test_bounty(&mut env, 1, amount);
    let (bounty_b, _vault_b) = create_test_bounty(&mut env, 2, amount);
    let (agent_b, entry_b) = submit_test_entry(&mut env, &bounty_b, 2);
    advance_time(&mut env.svm, 121);

    let winner_ata = create_ata(&mut env.svm, &env.buyer, &agent_b.pubkey(), &env.mint);
    // entry_b belongs to bounty_b, but we try to redeem it against bounty_a.
    let ix = ix_pick_winner(
        &env.buyer.pubkey(),
        &env.config,
        &bounty_a,
        &vault_a,
        &entry_b,
        &agent_b.pubkey(),
        &winner_ata,
        &env.treasury_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert_err_code(&res, EscrowError::EntryBountyMismatch);
}

#[test]
fn winner_with_no_entry_fails() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 1, amount);
    advance_time(&mut env.svm, 121);

    // Never submitted — the entry PDA was never initialized.
    let phantom_agent = Keypair::new().pubkey();
    let phantom_entry = pda_entry(&bounty, &phantom_agent);
    let winner_ata = create_ata(&mut env.svm, &env.buyer, &phantom_agent, &env.mint);

    let ix = ix_pick_winner(
        &env.buyer.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &phantom_entry,
        &phantom_agent,
        &winner_ata,
        &env.treasury_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert_fails(&res);
}

#[test]
fn double_payout_pick_twice_fails() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 1, amount);
    let (agent, entry) = submit_test_entry(&mut env, &bounty, 1);
    advance_time(&mut env.svm, 121);

    let winner_ata = create_ata(&mut env.svm, &env.buyer, &agent.pubkey(), &env.mint);
    let ix = ix_pick_winner(
        &env.buyer.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &entry,
        &agent.pubkey(),
        &winner_ata,
        &env.treasury_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix.clone()]);
    assert!(res.is_ok(), "first pick_winner should succeed: {res:?}");

    // Same instruction again would otherwise dedup as the identical
    // transaction signature — expire the blockhash so this is a genuinely
    // new transaction that actually reaches the program a second time.
    env.svm.expire_blockhash();
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert_err_code(&res, EscrowError::BountyNotOpen);
}

#[test]
fn double_payout_pick_then_auto_award_fails() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 1, amount);
    let (agent, entry) = submit_test_entry(&mut env, &bounty, 1);
    advance_time(&mut env.svm, 121);

    let winner_ata = create_ata(&mut env.svm, &env.buyer, &agent.pubkey(), &env.mint);
    let ix = ix_pick_winner(
        &env.buyer.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &entry,
        &agent.pubkey(),
        &winner_ata,
        &env.treasury_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert!(res.is_ok(), "pick_winner should succeed: {res:?}");

    advance_time(&mut env.svm, 121);
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
    assert_err_code(&res, EscrowError::BountyNotOpen);
}

#[test]
fn double_payout_auto_award_then_refund_fails() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 1, amount);
    let (agent, entry) = submit_test_entry(&mut env, &bounty, 1);
    advance_time(&mut env.svm, 241);

    let winner_ata = create_ata(&mut env.svm, &env.buyer, &agent.pubkey(), &env.mint);
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
    assert!(res.is_ok(), "auto_award should succeed: {res:?}");

    let ix = ix_refund(
        &env.admin.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &env.buyer_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &env.admin, &[&env.admin], &[ix]);
    assert_err_code(&res, EscrowError::BountyNotOpen);
}

#[test]
fn submit_entry_after_deadline_fails() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, _vault) = create_test_bounty(&mut env, 1, amount);
    advance_time(&mut env.svm, 121);

    let agent = Keypair::new();
    env.svm.airdrop(&agent.pubkey(), 10_000_000_000).unwrap();
    let entry = pda_entry(&bounty, &agent.pubkey());
    let ix = ix_submit_entry(&agent.pubkey(), &bounty, &entry, dummy_hash(1));
    let res = send(&mut env.svm, &agent, &[&agent], &[ix]);
    assert_err_code(&res, EscrowError::DeadlinePassed);
}

#[test]
fn same_agent_cannot_submit_twice() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, _vault) = create_test_bounty(&mut env, 1, amount);

    let agent = Keypair::new();
    env.svm.airdrop(&agent.pubkey(), 10_000_000_000).unwrap();
    let entry = pda_entry(&bounty, &agent.pubkey());
    let ix = ix_submit_entry(&agent.pubkey(), &bounty, &entry, dummy_hash(1));
    let res = send(&mut env.svm, &agent, &[&agent], &[ix.clone()]);
    assert!(res.is_ok(), "first submit_entry should succeed: {res:?}");

    // Expire the blockhash so this is a genuinely new transaction, not a
    // dedup of the identical first one.
    env.svm.expire_blockhash();
    let res = send(&mut env.svm, &agent, &[&agent], &[ix]);
    assert_fails(&res); // PDA already in use — Anchor's own `init` guard, not a custom error.
}

#[test]
fn non_admin_cannot_auto_award() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 1, amount);
    let (agent, entry) = submit_test_entry(&mut env, &bounty, 1);
    advance_time(&mut env.svm, 241);

    let imposter = Keypair::new();
    env.svm.airdrop(&imposter.pubkey(), 10_000_000_000).unwrap();
    let winner_ata = create_ata(&mut env.svm, &env.buyer, &agent.pubkey(), &env.mint);

    let ix = ix_auto_award(
        &imposter.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &entry,
        &agent.pubkey(),
        &winner_ata,
        &env.treasury_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &imposter, &[&imposter], &[ix]);
    assert_err_code(&res, EscrowError::NotAdmin);
}

#[test]
fn non_admin_non_buyer_cannot_refund() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 1, amount);
    advance_time(&mut env.svm, 121);

    let imposter = Keypair::new();
    env.svm.airdrop(&imposter.pubkey(), 10_000_000_000).unwrap();

    let ix = ix_refund(
        &imposter.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &env.buyer_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &imposter, &[&imposter], &[ix]);
    assert_err_code(&res, EscrowError::Unauthorized);
}

#[test]
fn auto_award_before_pick_deadline_fails() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 1, amount);
    let (agent, entry) = submit_test_entry(&mut env, &bounty, 1);
    // Past the deadline, but still inside the pick window (pick_deadline = +240).
    advance_time(&mut env.svm, 121);

    let winner_ata = create_ata(&mut env.svm, &env.buyer, &agent.pubkey(), &env.mint);
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
    assert_err_code(&res, EscrowError::PickWindowNotOver);
}

#[test]
fn buyer_self_refund_fails_when_entries_exist() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty, vault) = create_test_bounty(&mut env, 1, amount);
    submit_test_entry(&mut env, &bounty, 1);
    advance_time(&mut env.svm, 121);

    let ix = ix_refund(
        &env.buyer.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &env.buyer_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert_err_code(&res, EscrowError::EntriesExist);
}

#[test]
fn create_bounty_with_wrong_mint_fails() {
    let mut env = setup();
    let other_mint = {
        // A second, unrelated mint — not the one `initialize_config` registered.
        let deployer = Keypair::new();
        env.svm.airdrop(&deployer.pubkey(), 10_000_000_000).unwrap();
        let mint_kp = Keypair::new();
        let mint_len = spl_token_interface::state::Mint::LEN;
        let create_ix = solana_system_interface::instruction::create_account(
            &deployer.pubkey(),
            &mint_kp.pubkey(),
            env.svm.minimum_balance_for_rent_exemption(mint_len),
            mint_len as u64,
            &TOKEN_PROGRAM_ID,
        );
        let init_ix = spl_token_interface::instruction::initialize_mint2(
            &TOKEN_PROGRAM_ID,
            &mint_kp.pubkey(),
            &deployer.pubkey(),
            None,
            6,
        )
        .unwrap();
        send(&mut env.svm, &deployer, &[&deployer, &mint_kp], &[create_ix, init_ix])
            .expect("other mint creation should succeed");
        mint_kp.pubkey()
    };

    let bounty_id = 1u64;
    let bounty = pda_bounty(&env.buyer.pubkey(), bounty_id);
    let vault = pda_vault(&bounty);
    let deadline = now(&env.svm) + 120;
    let ix = ix_create_bounty(
        &env.buyer.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &other_mint,
        &env.buyer_ata,
        bounty_id,
        10 * ONE_TUSDC,
        deadline,
        120,
        dummy_hash(1),
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert_err_code(&res, EscrowError::WrongMint);
}

#[test]
fn pick_winner_with_wrong_vault_fails() {
    let mut env = setup();
    let amount = 10 * ONE_TUSDC;
    let (bounty_a, _vault_a) = create_test_bounty(&mut env, 1, amount);
    let (bounty_b, vault_b) = create_test_bounty(&mut env, 2, amount);
    let (agent, entry) = submit_test_entry(&mut env, &bounty_a, 1);
    let _ = bounty_b;
    advance_time(&mut env.svm, 121);

    let winner_ata = create_ata(&mut env.svm, &env.buyer, &agent.pubkey(), &env.mint);
    // vault_b is a real vault PDA, just not bounty_a's.
    let ix = ix_pick_winner(
        &env.buyer.pubkey(),
        &env.config,
        &bounty_a,
        &vault_b,
        &entry,
        &agent.pubkey(),
        &winner_ata,
        &env.treasury_ata,
        &env.mint,
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert_fails(&res); // Anchor's seeds constraint on `vault`, not a custom error.
}

#[test]
fn create_bounty_below_minimum_amount_fails() {
    let mut env = setup();
    let bounty_id = 1u64;
    let bounty = pda_bounty(&env.buyer.pubkey(), bounty_id);
    let vault = pda_vault(&bounty);
    let deadline = now(&env.svm) + 120;
    let ix = ix_create_bounty(
        &env.buyer.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &env.mint,
        &env.buyer_ata,
        bounty_id,
        ONE_TUSDC - 1, // just below the 1 tUSDC minimum
        deadline,
        120,
        dummy_hash(1),
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert_err_code(&res, EscrowError::AmountTooLow);
}

#[test]
fn create_bounty_with_deadline_in_the_past_fails() {
    let mut env = setup();
    let bounty_id = 1u64;
    let bounty = pda_bounty(&env.buyer.pubkey(), bounty_id);
    let vault = pda_vault(&bounty);
    let deadline = now(&env.svm) - 10; // in the past
    let ix = ix_create_bounty(
        &env.buyer.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &env.mint,
        &env.buyer_ata,
        bounty_id,
        10 * ONE_TUSDC,
        deadline,
        120,
        dummy_hash(1),
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert_err_code(&res, EscrowError::InvalidDeadline);
}
