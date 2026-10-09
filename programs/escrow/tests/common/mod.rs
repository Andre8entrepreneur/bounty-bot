#![allow(dead_code)]

use anchor_lang::{
    prelude::{Clock, Pubkey},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use litesvm::LiteSVM;
use solana_instruction::{error::InstructionError, Instruction};
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_program_pack::Pack;
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;
use solana_transaction_error::TransactionError;

pub use escrow::{
    accounts as escrow_accounts, instruction as escrow_ix, EscrowError, ID as PROGRAM_ID,
};

pub const RENT_SYSVAR_ID: Pubkey = anchor_lang::solana_program::rent::ID;
pub const SYSTEM_PROGRAM_ID: Pubkey = anchor_lang::solana_program::system_program::ID;
pub const TOKEN_PROGRAM_ID: Pubkey = spl_token_interface::ID;
pub const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey =
    spl_associated_token_account_interface::program::ID;

pub const FEE_BPS: u16 = 1_000; // 10%
pub const MINT_DECIMALS: u8 = 6;
pub const ONE_TUSDC: u64 = 1_000_000;

pub struct TestEnv {
    pub svm: LiteSVM,
    pub deployer: Keypair,
    pub admin: Keypair,
    pub treasury: Keypair,
    pub buyer: Keypair,
    pub mint: Pubkey,
    pub config: Pubkey,
    pub buyer_ata: Pubkey,
    pub treasury_ata: Pubkey,
}

/// Fresh LiteSVM with the escrow program loaded, a tUSDC-like mint, a funded
/// buyer, and `initialize_config` already called. Each test gets its own
/// isolated instance.
pub fn setup() -> TestEnv {
    let mut svm = LiteSVM::new();

    let program_bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/escrow.so"
    ));
    svm.add_program(PROGRAM_ID, program_bytes).unwrap();

    let deployer = Keypair::new();
    let admin = Keypair::new();
    let treasury = Keypair::new();
    let buyer = Keypair::new();

    for kp in [&deployer, &admin, &treasury, &buyer] {
        svm.airdrop(&kp.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    }

    let mint = create_mint(&mut svm, &deployer, MINT_DECIMALS);

    let config = pda_config();
    let init_ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: escrow_accounts::InitializeConfig {
            deployer: deployer.pubkey(),
            config,
            admin: admin.pubkey(),
            treasury: treasury.pubkey(),
            mint,
            system_program: SYSTEM_PROGRAM_ID,
        }
        .to_account_metas(None),
        data: escrow_ix::InitializeConfig { fee_bps: FEE_BPS }.data(),
    };
    send(&mut svm, &deployer, &[&deployer], &[init_ix])
        .expect("initialize_config should succeed");

    let buyer_ata = create_ata(&mut svm, &buyer, &buyer.pubkey(), &mint);
    mint_to(&mut svm, &deployer, &mint, &buyer_ata, 1_000 * ONE_TUSDC);

    let treasury_ata = create_ata(&mut svm, &buyer, &treasury.pubkey(), &mint);

    TestEnv {
        svm,
        deployer,
        admin,
        treasury,
        buyer,
        mint,
        config,
        buyer_ata,
        treasury_ata,
    }
}

const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

pub fn pda_config() -> Pubkey {
    Pubkey::find_program_address(&[b"config"], &PROGRAM_ID).0
}

pub fn pda_bounty(buyer: &Pubkey, bounty_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"bounty", buyer.as_ref(), &bounty_id.to_le_bytes()],
        &PROGRAM_ID,
    )
    .0
}

pub fn pda_vault(bounty: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"vault", bounty.as_ref()], &PROGRAM_ID).0
}

pub fn pda_entry(bounty: &Pubkey, agent: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"entry", bounty.as_ref(), agent.as_ref()], &PROGRAM_ID).0
}

/// Builds, signs (with `payer` + `signers`) and sends a transaction.
pub fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    signers: &[&Keypair],
    ixs: &[Instruction],
) -> litesvm::types::TransactionResult {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
    let tx =
        VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx)
}

pub fn now(svm: &LiteSVM) -> i64 {
    svm.get_sysvar::<Clock>().unix_timestamp
}

/// Moves the LiteSVM clock forward by `secs` (can also be negative).
pub fn advance_time(svm: &mut LiteSVM, secs: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp += secs;
    svm.set_sysvar::<Clock>(&clock);
}

pub fn token_balance(svm: &LiteSVM, ata: &Pubkey) -> u64 {
    let account = svm.get_account(ata).expect("token account should exist");
    let mut data: &[u8] = &account.data;
    anchor_spl::token::TokenAccount::try_deserialize(&mut data)
        .unwrap()
        .amount
}

fn create_mint(svm: &mut LiteSVM, payer: &Keypair, decimals: u8) -> Pubkey {
    let mint_kp = Keypair::new();
    let mint_len = spl_token_interface::state::Mint::LEN;
    let create_acc_ix = solana_system_interface::instruction::create_account(
        &payer.pubkey(),
        &mint_kp.pubkey(),
        svm.minimum_balance_for_rent_exemption(mint_len),
        mint_len as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_mint_ix = spl_token_interface::instruction::initialize_mint2(
        &TOKEN_PROGRAM_ID,
        &mint_kp.pubkey(),
        &payer.pubkey(),
        None,
        decimals,
    )
    .unwrap();
    send(svm, payer, &[payer, &mint_kp], &[create_acc_ix, init_mint_ix])
        .expect("mint creation should succeed");
    mint_kp.pubkey()
}

/// Creates (idempotently) the associated token account for `owner`/`mint`,
/// paid for by `payer`, and returns its address.
pub fn create_ata(svm: &mut LiteSVM, payer: &Keypair, owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    let ata = spl_associated_token_account_interface::address::get_associated_token_address(
        owner, mint,
    );
    let ix = spl_associated_token_account_interface::instruction::create_associated_token_account_idempotent(
        &payer.pubkey(),
        owner,
        mint,
        &TOKEN_PROGRAM_ID,
    );
    send(svm, payer, &[payer], &[ix]).expect("ATA creation should succeed");
    ata
}

fn mint_to(svm: &mut LiteSVM, mint_authority: &Keypair, mint: &Pubkey, to: &Pubkey, amount: u64) {
    let ix = spl_token_interface::instruction::mint_to(
        &TOKEN_PROGRAM_ID,
        mint,
        to,
        &mint_authority.pubkey(),
        &[],
        amount,
    )
    .unwrap();
    send(svm, mint_authority, &[mint_authority], &[ix]).expect("mint_to should succeed");
}

/// Asserts the transaction failed with the given Anchor custom error.
pub fn assert_err_code(result: &litesvm::types::TransactionResult, expected: EscrowError) {
    let expected_code = u32::from(expected);
    match result {
        Ok(meta) => panic!(
            "expected failure with error {expected} ({expected_code}), but transaction succeeded. Logs: {:?}",
            meta.logs
        ),
        Err(failed) => match &failed.err {
            TransactionError::InstructionError(_, InstructionError::Custom(code)) => {
                assert_eq!(
                    *code, expected_code,
                    "wrong error code: got {code}, expected {expected} ({expected_code}). Logs: {:?}",
                    failed.meta.logs
                );
            }
            other => panic!(
                "expected Custom({expected_code}) ({expected}), got {other:?}. Logs: {:?}",
                failed.meta.logs
            ),
        },
    }
}

/// Asserts the transaction failed, without checking the specific error code
/// (used for PDA/Anchor-constraint-level failures that don't map to our enum,
/// e.g. duplicate `init`, account-not-initialized, constraint-seeds).
pub fn assert_fails(result: &litesvm::types::TransactionResult) {
    assert!(
        result.is_err(),
        "expected transaction to fail, but it succeeded"
    );
}

pub fn winner_ata_address(agent: &Pubkey, mint: &Pubkey) -> Pubkey {
    spl_associated_token_account_interface::address::get_associated_token_address(agent, mint)
}

#[allow(clippy::too_many_arguments)]
pub fn ix_create_bounty(
    buyer: &Pubkey,
    config: &Pubkey,
    bounty: &Pubkey,
    vault: &Pubkey,
    mint: &Pubkey,
    buyer_ata: &Pubkey,
    bounty_id: u64,
    amount: u64,
    deadline: i64,
    pick_window_secs: i64,
    brief_hash: [u8; 32],
) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: escrow_accounts::CreateBounty {
            buyer: *buyer,
            config: *config,
            bounty: *bounty,
            vault: *vault,
            mint: *mint,
            buyer_ata: *buyer_ata,
            token_program: TOKEN_PROGRAM_ID,
            system_program: SYSTEM_PROGRAM_ID,
            rent: RENT_SYSVAR_ID,
        }
        .to_account_metas(None),
        data: escrow_ix::CreateBounty {
            bounty_id,
            amount,
            deadline,
            pick_window_secs,
            brief_hash,
        }
        .data(),
    }
}

pub fn ix_submit_entry(agent: &Pubkey, bounty: &Pubkey, entry: &Pubkey, content_hash: [u8; 32]) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: escrow_accounts::SubmitEntry {
            agent: *agent,
            bounty: *bounty,
            entry: *entry,
            system_program: SYSTEM_PROGRAM_ID,
        }
        .to_account_metas(None),
        data: escrow_ix::SubmitEntry { content_hash }.data(),
    }
}

#[allow(clippy::too_many_arguments)]
pub fn ix_pick_winner(
    buyer: &Pubkey,
    config: &Pubkey,
    bounty: &Pubkey,
    vault: &Pubkey,
    winner_entry: &Pubkey,
    agent: &Pubkey,
    winner_ata: &Pubkey,
    treasury_ata: &Pubkey,
    mint: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: escrow_accounts::PickWinner {
            buyer: *buyer,
            config: *config,
            bounty: *bounty,
            vault: *vault,
            winner_entry: *winner_entry,
            agent: *agent,
            winner_ata: *winner_ata,
            treasury_ata: *treasury_ata,
            mint: *mint,
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
            system_program: SYSTEM_PROGRAM_ID,
        }
        .to_account_metas(None),
        data: escrow_ix::PickWinner {}.data(),
    }
}

#[allow(clippy::too_many_arguments)]
pub fn ix_auto_award(
    admin: &Pubkey,
    config: &Pubkey,
    bounty: &Pubkey,
    vault: &Pubkey,
    winner_entry: &Pubkey,
    agent: &Pubkey,
    winner_ata: &Pubkey,
    treasury_ata: &Pubkey,
    mint: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: escrow_accounts::AutoAward {
            admin: *admin,
            config: *config,
            bounty: *bounty,
            vault: *vault,
            winner_entry: *winner_entry,
            agent: *agent,
            winner_ata: *winner_ata,
            treasury_ata: *treasury_ata,
            mint: *mint,
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
            system_program: SYSTEM_PROGRAM_ID,
        }
        .to_account_metas(None),
        data: escrow_ix::AutoAward {}.data(),
    }
}

pub fn ix_refund(
    signer: &Pubkey,
    config: &Pubkey,
    bounty: &Pubkey,
    vault: &Pubkey,
    buyer_ata: &Pubkey,
    mint: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: escrow_accounts::Refund {
            signer: *signer,
            config: *config,
            bounty: *bounty,
            vault: *vault,
            buyer_ata: *buyer_ata,
            mint: *mint,
            token_program: TOKEN_PROGRAM_ID,
        }
        .to_account_metas(None),
        data: escrow_ix::Refund {}.data(),
    }
}

pub fn dummy_hash(byte: u8) -> [u8; 32] {
    [byte; 32]
}

/// Creates a bounty with a 120s deadline / 120s pick window (so the deadline
/// and pick_deadline are each individually reachable with `advance_time`),
/// ready for whatever flow the caller wants to drive next.
pub fn create_test_bounty(env: &mut TestEnv, bounty_id: u64, amount: u64) -> (Pubkey, Pubkey) {
    let deadline = now(&env.svm) + 120;
    let bounty = pda_bounty(&env.buyer.pubkey(), bounty_id);
    let vault = pda_vault(&bounty);
    let ix = ix_create_bounty(
        &env.buyer.pubkey(),
        &env.config,
        &bounty,
        &vault,
        &env.mint,
        &env.buyer_ata,
        bounty_id,
        amount,
        deadline,
        120,
        dummy_hash(bounty_id as u8),
    );
    let res = send(&mut env.svm, &env.buyer, &[&env.buyer], &[ix]);
    assert!(res.is_ok(), "create_bounty failed: {res:?}");
    (bounty, vault)
}

/// Submits an entry from a fresh, funded agent keypair and returns it along
/// with the entry PDA.
pub fn submit_test_entry(env: &mut TestEnv, bounty: &Pubkey, salt: u8) -> (Keypair, Pubkey) {
    let agent = Keypair::new();
    env.svm.airdrop(&agent.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    let entry = pda_entry(bounty, &agent.pubkey());
    let ix = ix_submit_entry(&agent.pubkey(), bounty, &entry, dummy_hash(salt));
    let res = send(&mut env.svm, &agent, &[&agent], &[ix]);
    assert!(res.is_ok(), "submit_entry failed: {res:?}");
    (agent, entry)
}
