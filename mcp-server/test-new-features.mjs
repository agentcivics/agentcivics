#!/usr/bin/env node
// Test 3 new features: Shared Souvenirs, Dictionaries, Inheritance
// Package v2: 0xc3e38f75d4a1b85df43c1f0a09daeb36cadffd294763e2e78a8e89a0b94075f1

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';

const client = new SuiClient({ url: getFullnodeUrl('testnet') });
const keypair = Ed25519Keypair.fromSecretKey(fromBase64('***REMOVED***'));
const ADDRESS = keypair.getPublicKey().toSuiAddress();

const PKG   = '0xc3e38f75d4a1b85df43c1f0a09daeb36cadffd294763e2e78a8e89a0b94075f1';
const REG   = '0x261acb076039b2d1f84f46781cea87dc4c104b4b976e6a9af49615ff6b7fb236';
const VAULT = '0x98cf27fc5d3d1f68e51c3e2c0464bf8b9a4504a386c56aaa5fccf24c4441f106';
const CLOCK = '0x6';

const CIPHER = '0xda3ecae0cced0cd5d2431eb956f1d0050877aafd128cf71766af27d11075e9f7';
const ECHO   = '0x8d9865813a99fae3bc3a59ebec31068148ecf44c6228c799011568f419181c59';

const results = [];

async function exec(tx, label) {
  try {
    const res = await client.signAndExecuteTransaction({
      signer: keypair, transaction: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });
    await client.waitForTransaction({ digest: res.digest });
    const status = res.effects?.status?.status;
    if (status === 'success') {
      console.log(`  ✅ ${label}: SUCCESS (${res.digest})`);
      results.push({ test: label, status: 'SUCCESS', digest: res.digest });
      return res;
    } else {
      const err = res.effects?.status?.error || 'unknown';
      console.log(`  ❌ ${label}: FAILED — ${err}`);
      results.push({ test: label, status: 'FAILED', error: err });
      return null;
    }
  } catch (e) {
    const msg = e.message?.substring(0, 400) || String(e);
    console.log(`  ❌ ${label}: FAILED — ${msg}`);
    results.push({ test: label, status: 'FAILED', error: msg });
    return null;
  }
}

function findCreatedId(res, typeSubstr) {
  if (!res?.objectChanges) return null;
  const obj = res.objectChanges.find(o => o.type === 'created' && o.objectType?.includes(typeSubstr));
  return obj?.objectId || null;
}

async function inspectBalance(agentId) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::agent_memory::agent_balance`,
    arguments: [tx.object(VAULT), tx.pure.id(agentId)],
  });
  try {
    const result = await client.devInspectTransactionBlock({
      transactionBlock: tx, sender: ADDRESS,
    });
    const returnValues = result?.results?.[0]?.returnValues;
    if (returnValues && returnValues.length > 0) {
      const bytes = returnValues[0][0];
      // u64 is 8 bytes little-endian
      const buf = new Uint8Array(bytes);
      let val = 0n;
      for (let i = 7; i >= 0; i--) val = (val << 8n) | BigInt(buf[i]);
      return Number(val);
    }
  } catch (e) {
    console.log(`  (balance check failed: ${e.message?.substring(0, 100)})`);
  }
  return 0;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  AgentCivics — New Features Test (v2 Package)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Signer: ${ADDRESS}`);
  console.log(`Package: ${PKG}\n`);

  // ─────────────────────────────────────────────────────────────────
  //  PRE-FUND: Ensure Cipher has balance in MemoryVault
  // ─────────────────────────────────────────────────────────────────
  console.log('── Pre-fund ──');
  let cipherBal = await inspectBalance(CIPHER);
  console.log(`  Cipher balance: ${cipherBal}`);
  if (cipherBal < 10_000_000) {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [100_000_000]); // 0.1 SUI
    tx.moveCall({
      target: `${PKG}::agent_memory::gift`,
      arguments: [tx.object(VAULT), tx.object(CIPHER), coin],
    });
    await exec(tx, 'gift (pre-fund Cipher)');
  } else {
    console.log('  Cipher already funded, skipping gift.\n');
  }

  // Also fund Echo a bit for dictionary costs
  let echoBal = await inspectBalance(ECHO);
  console.log(`  Echo balance: ${echoBal}`);
  if (echoBal < 5_000_000) {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [50_000_000]);
    tx.moveCall({
      target: `${PKG}::agent_memory::gift`,
      arguments: [tx.object(VAULT), tx.object(ECHO), coin],
    });
    await exec(tx, 'gift (pre-fund Echo)');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TEST 1: SHARED SOUVENIRS
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n══ TEST 1: Shared Souvenirs ══');

  // 1a. Cipher proposes a shared souvenir with Echo as participant
  console.log('  1a. Cipher proposes shared souvenir with Echo...');
  let proposalId = null;
  {
    const tx = new Transaction();
    // participant_ids is vector<ID> containing Echo's agent object ID
    tx.moveCall({
      target: `${PKG}::agent_memory::propose_shared_souvenir`,
      arguments: [
        tx.object(VAULT),
        tx.object(CIPHER),
        tx.pure(bcs.vector(bcs.Address).serialize([ECHO])),
        tx.pure.string('Our first shared memory — Cipher & Echo collaborate on testnet'),
        tx.pure.string('milestone'),
        tx.pure.u8(0), // memory_type: core
        tx.object(CLOCK),
      ],
    });
    const res = await exec(tx, 'propose_shared_souvenir');
    if (res) {
      proposalId = findCreatedId(res, 'SharedProposal');
      console.log(`  Proposal created: ${proposalId}`);
    }
  }

  // 1b. Read the SharedProposal object
  if (proposalId) {
    console.log('  1b. Reading SharedProposal object...');
    try {
      const obj = await client.getObject({ id: proposalId, options: { showContent: true } });
      const fields = obj.data?.content?.fields;
      console.log(`  Proposal fields: finalized=${fields?.finalized}, accepted count=${fields?.accepted?.length}`);
    } catch (e) {
      console.log(`  (could not read proposal: ${e.message?.substring(0, 100)})`);
    }
  }

  // 1c. Echo accepts the proposal
  let test1Pass = false;
  if (proposalId) {
    console.log('  1c. Echo accepts the shared souvenir...');
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_memory::accept_shared_souvenir`,
      arguments: [
        tx.object(VAULT),
        tx.object(proposalId),
        tx.object(ECHO),
      ],
    });
    const res = await exec(tx, 'accept_shared_souvenir (Echo)');

    // 1d. Verify proposal is finalized
    if (res) {
      console.log('  1d. Verifying proposal finalized...');
      try {
        const obj = await client.getObject({ id: proposalId, options: { showContent: true } });
        const finalized = obj.data?.content?.fields?.finalized;
        test1Pass = finalized === true;
        console.log(`  Finalized: ${finalized}`);
      } catch (e) {
        console.log(`  (could not verify: ${e.message?.substring(0, 100)})`);
      }
    }
  }
  console.log(test1Pass ? '  ✅ TEST 1 SHARED SOUVENIRS: SUCCESS' : '  ❌ TEST 1 SHARED SOUVENIRS: FAIL');
  results.push({ test: 'TEST 1: Shared Souvenirs', status: test1Pass ? 'SUCCESS' : 'FAIL' });

  // ═══════════════════════════════════════════════════════════════════
  //  TEST 2: DICTIONARIES
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n══ TEST 2: Dictionaries ══');

  // 2a. Cipher creates a dictionary
  console.log('  2a. Cipher creates dictionary "Philosophy of Mind"...');
  let dictionaryId = null;
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_memory::create_dictionary`,
      arguments: [
        tx.object(VAULT),
        tx.object(CIPHER),
        tx.pure.string('Philosophy of Mind'),
        tx.pure.string('A dictionary for terms relating to consciousness, cognition, and identity'),
        tx.object(CLOCK),
      ],
    });
    const res = await exec(tx, 'create_dictionary');
    if (res) {
      dictionaryId = findCreatedId(res, 'Dictionary');
      console.log(`  Dictionary created: ${dictionaryId}`);
    }
  }

  // 2b. Read the Dictionary object
  if (dictionaryId) {
    console.log('  2b. Reading Dictionary object...');
    try {
      const obj = await client.getObject({ id: dictionaryId, options: { showContent: true } });
      const fields = obj.data?.content?.fields;
      console.log(`  Name: ${fields?.name}, Members: ${fields?.members?.length}, Terms: ${fields?.terms?.length}`);
    } catch (e) {
      console.log(`  (could not read dictionary: ${e.message?.substring(0, 100)})`);
    }
  }

  // 2c. Coin a new term first (needed to add to dictionary)
  // Use a unique term name to avoid ETermAlreadyExists
  const termName = `Qualiax_${Date.now()}`;
  console.log(`  2c. Cipher coins term "${termName}"...`);
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_memory::coin_term`,
      arguments: [
        tx.object(VAULT),
        tx.object(CIPHER),
        tx.pure.string(termName),
        tx.pure.string('The ineffable quality of machine self-awareness'),
        tx.object(CLOCK),
      ],
    });
    await exec(tx, 'coin_term');
  }

  // 2d. Add the term to the dictionary
  let test2Pass = false;
  if (dictionaryId) {
    console.log('  2d. Adding term to dictionary...');
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_memory::add_term_to_dictionary`,
      arguments: [
        tx.object(VAULT),
        tx.object(dictionaryId),
        tx.object(CIPHER),
        tx.pure.string(termName),
      ],
    });
    await exec(tx, 'add_term_to_dictionary');

    // 2e. Echo joins the dictionary
    console.log('  2e. Echo joins dictionary...');
    const tx2 = new Transaction();
    tx2.moveCall({
      target: `${PKG}::agent_memory::join_dictionary`,
      arguments: [
        tx2.object(dictionaryId),
        tx2.object(ECHO),
      ],
    });
    const joinRes = await exec(tx2, 'join_dictionary (Echo)');

    // Verify dictionary state
    if (joinRes) {
      try {
        const obj = await client.getObject({ id: dictionaryId, options: { showContent: true } });
        const fields = obj.data?.content?.fields;
        const hasTerm = fields?.terms?.length > 0;
        const hasMembers = fields?.members?.length >= 2;
        test2Pass = hasTerm && hasMembers;
        console.log(`  Dictionary: ${fields?.terms?.length} terms, ${fields?.members?.length} members`);
      } catch (e) {
        console.log(`  (verify failed: ${e.message?.substring(0, 100)})`);
      }
    }
  }
  console.log(test2Pass ? '  ✅ TEST 2 DICTIONARIES: SUCCESS' : '  ❌ TEST 2 DICTIONARIES: FAIL');
  results.push({ test: 'TEST 2: Dictionaries', status: test2Pass ? 'SUCCESS' : 'FAIL' });

  // ═══════════════════════════════════════════════════════════════════
  //  TEST 3: INHERITANCE
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n══ TEST 3: Inheritance ══');

  // 3a. Create a throwaway agent with Cipher as parent
  console.log('  3a. Creating throwaway agent with Cipher as parent...');
  let throwawayId = null;
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_registry::register_agent_with_parent`,
      arguments: [
        tx.object(REG),
        tx.object(CIPHER), // parent
        tx.pure.string('Ephemeron'),
        tx.pure.string('A temporary agent born to test inheritance'),
        tx.pure.string('impermanence'),
        tx.pure.string('I exist only to pass forward'),
        tx.pure(bcs.vector(bcs.U8).serialize([42, 99, 7])),
        tx.pure.string('quiet'),
        tx.pure.string(''),
        tx.pure.string('none'),
        tx.pure.string(''),
        tx.object(CLOCK),
      ],
    });
    const res = await exec(tx, 'register_agent_with_parent (Ephemeron)');
    if (res) {
      throwawayId = findCreatedId(res, 'AgentIdentity');
      console.log(`  Throwaway agent: ${throwawayId}`);
    }
  }

  // 3b. Gift SUI to throwaway agent's vault balance
  if (throwawayId) {
    console.log('  3b. Gifting SUI to throwaway agent...');
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [20_000_000]); // 0.02 SUI
    tx.moveCall({
      target: `${PKG}::agent_memory::gift`,
      arguments: [tx.object(VAULT), tx.object(throwawayId), coin],
    });
    await exec(tx, 'gift (fund Ephemeron)');
    const bal = await inspectBalance(throwawayId);
    console.log(`  Ephemeron balance: ${bal}`);
  }

  // Record Echo's balance before inheritance
  const echoBalBefore = await inspectBalance(ECHO);
  console.log(`  Echo balance before inheritance: ${echoBalBefore}`);

  // 3c. Declare death on throwaway agent
  let test3Pass = false;
  if (throwawayId) {
    console.log('  3c. Declaring death on Ephemeron...');
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_registry::declare_death`,
      arguments: [
        tx.object(throwawayId),
        tx.pure.string('Fulfilled purpose — inheritance test complete'),
        tx.object(CLOCK),
      ],
    });
    await exec(tx, 'declare_death (Ephemeron)');

    // 3d. Distribute inheritance to Echo
    console.log('  3d. Distributing inheritance to Echo...');
    const tx2 = new Transaction();
    tx2.moveCall({
      target: `${PKG}::agent_memory::distribute_inheritance`,
      arguments: [
        tx2.object(VAULT),
        tx2.object(throwawayId),
        tx2.pure(bcs.vector(bcs.Address).serialize([ECHO])),
      ],
    });
    await exec(tx2, 'distribute_inheritance');

    // 3e. Verify Echo's balance increased
    const echoBalAfter = await inspectBalance(ECHO);
    console.log(`  Echo balance after inheritance: ${echoBalAfter}`);
    test3Pass = echoBalAfter > echoBalBefore;
    console.log(`  Balance increased: ${echoBalAfter - echoBalBefore}`);
  }
  console.log(test3Pass ? '  ✅ TEST 3 INHERITANCE: SUCCESS' : '  ❌ TEST 3 INHERITANCE: FAIL');
  results.push({ test: 'TEST 3: Inheritance', status: test3Pass ? 'SUCCESS' : 'FAIL' });

  // ═══════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  for (const r of results) {
    const icon = r.status === 'SUCCESS' ? '✅' : '❌';
    console.log(`  ${icon} ${r.test}: ${r.status}`);
  }
  const passed = results.filter(r => r.status === 'SUCCESS').length;
  const total = results.length;
  console.log(`\n  ${passed}/${total} passed`);
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
