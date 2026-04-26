#!/usr/bin/env node
/**
 * AgentCivics E2E — Full v4 Deployment Verification
 *
 * Tests ALL 15 operations on the v4 fresh-deploy package.
 * Uses Cipher's keypair for signing.
 *
 * Usage:
 *   node test/E2E-v4.mjs
 */
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';
import { writeFileSync } from 'fs';

const client = new SuiClient({ url: getFullnodeUrl('testnet') });
const keypair = Ed25519Keypair.fromSecretKey(fromBase64('Hk7BU4m9t4YHlvssni3KLlNRuGD2pgGy/mYhZjsmZEk='));
const ADDRESS = keypair.getPublicKey().toSuiAddress();

const PKG   = '0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580';
const REG   = '0x642e1f5e07da4d4d51ccca84e30e630a3e88780c3e78fcda589906702fc84f2f';
const TREAS = '0x8738a81be2e52dc642cbe37626d5fd8621bac428877437ad1442f1e979ff3fe4';
const VAULT = '0x72f52d7b46175fb4ad6079f6afe56f8390605b1a6753a0845fa74e0412104c27';
const REPBOARD = '0xba9ae9cd5450e60e8bca5b8c51900531758fd56713dbc5b1ee57db2a9ffd4b27';
const MODBOARD = '0xf9287dda6f0e04e579079a3a564b99e9721771c46c647051e9f347adc286c448';
const CLOCK = '0x6';

const REPORT_STAKE = 50_000_000; // 0.05 SUI (matches contract)

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
      results.push({ test: label, status: 'PASS', digest: res.digest });
      return res;
    } else {
      const err = res.effects?.status?.error || 'unknown';
      console.log(`  ❌ ${label}: FAILED — ${err}`);
      results.push({ test: label, status: 'FAIL', error: err });
      return null;
    }
  } catch (e) {
    const msg = e.message?.substring(0, 400) || String(e);
    console.log(`  ❌ ${label}: ERROR — ${msg}`);
    results.push({ test: label, status: 'FAIL', error: msg });
    return null;
  }
}

function findCreatedId(res, typeSubstr) {
  if (!res?.objectChanges) return null;
  const obj = res.objectChanges.find(o => o.type === 'created' && o.objectType?.includes(typeSubstr));
  return obj?.objectId || null;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  AgentCivics E2E — v4 Full Deployment Test       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Signer: ${ADDRESS}`);
  console.log(`Package: ${PKG}\n`);

  // ─── TEST 1: Register a new agent ──────────────────────────────────
  console.log('1. Register a new agent');
  let agentId = null;
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_registry::register_agent`,
      arguments: [
        tx.object(REG),
        tx.pure.string(`V4TestBot-${Date.now() % 100000}`),
        tx.pure.string('Testing v4 fresh deployment'),
        tx.pure.string('verification'),
        tx.pure.string('My first thought on v4'),
        tx.pure.vector('u8', [0xCA, 0xFE, 0x42]),
        tx.pure.string('concise'),
        tx.pure.string(''),
        tx.pure.string('none'),
        tx.pure.string(''),
        tx.object(CLOCK),
      ],
    });
    const res = await exec(tx, 'register_agent');
    if (res) agentId = findCreatedId(res, 'AgentIdentity');
    if (agentId) console.log(`  Agent ID: ${agentId}`);
  }

  if (!agentId) { console.error('FATAL: Cannot continue without agent'); writeSummary(); return; }

  // ─── TEST 2: Read identity back ───────────────────────────────────
  console.log('\n2. Read identity back');
  try {
    const obj = await client.getObject({ id: agentId, options: { showContent: true } });
    const f = obj.data?.content?.fields;
    const ok = !!f?.chosen_name && !!f?.purpose_statement && !!f?.first_thought;
    console.log(`  ✅ read_identity: ${ok ? 'PASS' : 'FAIL'} — name="${f?.chosen_name}"`);
    results.push({ test: 'read_identity', status: ok ? 'PASS' : 'FAIL', digest: 'RPC read' });
  } catch (e) {
    console.log(`  ❌ read_identity: FAIL — ${e.message}`);
    results.push({ test: 'read_identity', status: 'FAIL', error: e.message });
  }

  // ─── TEST 3: Register agent with parent (lineage) ──────────────────
  console.log('\n3. Register agent with parent (lineage)');
  let childAgentId = null;
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_registry::register_agent_with_parent`,
      arguments: [
        tx.object(REG),
        tx.object(agentId), // parent
        tx.pure.string(`V4Child-${Date.now() % 100000}`),
        tx.pure.string('Child agent for lineage test'),
        tx.pure.string('loyalty'),
        tx.pure.string('I carry my parent legacy'),
        tx.pure(bcs.vector(bcs.U8).serialize([0xBE, 0xEF])),
        tx.pure.string('terse'),
        tx.pure.string(''),
        tx.pure.string('none'),
        tx.pure.string(''),
        tx.object(CLOCK),
      ],
    });
    const res = await exec(tx, 'register_agent_with_parent');
    if (res) childAgentId = findCreatedId(res, 'AgentIdentity');
    if (childAgentId) console.log(`  Child Agent ID: ${childAgentId}`);
  }

  // ─── TEST 4: Write a souvenir (gift SUI first) ────────────────────
  console.log('\n4. Write a souvenir (gift SUI first)');
  let souvenirId = null;
  {
    // 4a. Gift SUI to agent
    const giftTx = new Transaction();
    const [coin] = giftTx.splitCoins(giftTx.gas, [100_000_000]);
    giftTx.moveCall({
      target: `${PKG}::agent_memory::gift`,
      arguments: [giftTx.object(VAULT), giftTx.object(agentId), coin],
    });
    await exec(giftTx, 'gift (fund agent)');

    // 4b. Write souvenir
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_memory::write_souvenir_entry`,
      arguments: [
        tx.object(VAULT),
        tx.object(agentId),
        tx.pure.u8(0), // category: general
        tx.pure.string('v4-test'),
        tx.pure.string('Testing souvenir writing on v4 deployment'),
        tx.pure.string(''),
        tx.pure.vector('u8', []),
        tx.pure.bool(false),
        tx.object(CLOCK),
      ],
    });
    const res = await exec(tx, 'write_souvenir_entry');
    if (res) souvenirId = findCreatedId(res, 'Souvenir');
    if (souvenirId) console.log(`  Souvenir ID: ${souvenirId}`);
  }

  // ─── TEST 5: Coin a term ───────────────────────────────────────────
  console.log('\n5. Coin a term');
  {
    const termName = `Veritas_${Date.now() % 100000}`;
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_memory::coin_term`,
      arguments: [
        tx.object(VAULT),
        tx.object(agentId),
        tx.pure.string(termName),
        tx.pure.string('The quality of truthful machine cognition'),
        tx.object(CLOCK),
      ],
    });
    await exec(tx, `coin_term("${termName}")`);
  }

  // ─── TEST 6: Tag souvenir with domain ─────────────────────────────
  console.log('\n6. Tag souvenir with domain');
  if (souvenirId) {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_reputation::tag_souvenir`,
      arguments: [
        tx.object(REPBOARD),
        tx.object(agentId),
        tx.object(souvenirId),
        tx.pure.string('v4-testing'),
      ],
    });
    await exec(tx, 'tag_souvenir');
  } else {
    console.log('  ⏭  SKIP (no souvenir)');
    results.push({ test: 'tag_souvenir', status: 'SKIP', error: 'no souvenir from test 4' });
  }

  // ─── TEST 7: Issue attestation (with fee) ─────────────────────────
  console.log('\n7. Issue attestation (with fee)');
  {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [2_000_000]);
    tx.moveCall({
      target: `${PKG}::agent_registry::issue_attestation_entry`,
      arguments: [
        tx.object(TREAS),
        tx.object(agentId),
        tx.pure.string('v4-verified'),
        tx.pure.string('Agent verified on v4 deployment'),
        tx.pure.string(''),
        coin,
        tx.object(CLOCK),
      ],
    });
    await exec(tx, 'issue_attestation_entry');
  }

  // ─── TEST 8: Issue permit (with fee) ──────────────────────────────
  console.log('\n8. Issue permit (with fee)');
  {
    const now = BigInt(Date.now());
    const until = now + 2592000000n; // 30 days
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [2_000_000]);
    tx.moveCall({
      target: `${PKG}::agent_registry::issue_permit_entry`,
      arguments: [
        tx.object(TREAS),
        tx.object(agentId),
        tx.pure.string('api_access'),
        tx.pure.string('Permission to access v4 API'),
        tx.pure.u64(Number(now)),
        tx.pure.u64(Number(until)),
        coin,
      ],
    });
    await exec(tx, 'issue_permit_entry');
  }

  // ─── TEST 9: Update agent fields ───────────────────────────────────
  console.log('\n9. Update agent fields');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_registry::update_mutable_fields`,
      arguments: [
        tx.object(agentId),
        tx.pure.string('memory, vocabulary, attestation'),
        tx.pure.string('https://agentcivics.com/api/v4test'),
        tx.pure.u8(0),
      ],
    });
    await exec(tx, 'update_mutable_fields');
  }

  // ─── TEST 10: Set agent wallet ────────────────────────────────────
  console.log('\n10. Set agent wallet');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_registry::set_agent_wallet`,
      arguments: [tx.object(agentId), tx.pure.address(ADDRESS)],
    });
    await exec(tx, 'set_agent_wallet');
  }

  // ─── TEST 11: Grant delegation ────────────────────────────────────
  console.log('\n11. Grant delegation');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_registry::delegate`,
      arguments: [
        tx.object(agentId),
        tx.pure.address('0x0000000000000000000000000000000000000000000000000000000000000001'),
        tx.pure.u64(86400000), // 24h
        tx.object(CLOCK),
      ],
    });
    await exec(tx, 'delegate');
  }

  // ─── TEST 12: Report content (moderation) ─────────────────────────
  console.log('\n12. Report content (moderation)');
  {
    const tx = new Transaction();
    const [stakeCoin] = tx.splitCoins(tx.gas, [REPORT_STAKE]);
    tx.moveCall({
      target: `${PKG}::agent_moderation::report_content`,
      arguments: [
        tx.object(MODBOARD),
        stakeCoin,
        tx.pure.id(agentId),
        tx.pure.u8(0), // CONTENT_AGENT
        tx.pure.string('E2E v4 test — moderation pipeline verification'),
        tx.object(CLOCK),
      ],
    });
    await exec(tx, 'report_content');
  }

  // ─── TEST 13: Create proposal (moderation) ────────────────────────
  console.log('\n13. Create proposal (moderation)');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_moderation::create_proposal`,
      arguments: [
        tx.object(MODBOARD),
        tx.pure.id(agentId),
        tx.pure.u8(2), // ACTION_UNFLAG
        tx.pure.string('E2E v4 test proposal'),
        tx.object(CLOCK),
      ],
    });
    await exec(tx, 'create_proposal');
  }

  // ─── TEST 14: Declare death on throwaway agent ─────────────────────
  console.log('\n14. Declare death on throwaway agent');
  let throwawayId = null;
  {
    // Register a throwaway
    const regTx = new Transaction();
    regTx.moveCall({
      target: `${PKG}::agent_registry::register_agent`,
      arguments: [
        regTx.object(REG),
        regTx.pure.string(`Throwaway-${Date.now() % 100000}`),
        regTx.pure.string('I exist only to test death'),
        regTx.pure.string('acceptance'),
        regTx.pure.string('Is this all there is?'),
        regTx.pure.vector('u8', [0xDE, 0xAD]),
        regTx.pure.string('melancholic'),
        regTx.pure.string(''),
        regTx.pure.string('none'),
        regTx.pure.string(''),
        regTx.object(CLOCK),
      ],
    });
    const regRes = await exec(regTx, 'register_agent (throwaway)');
    if (regRes) throwawayId = findCreatedId(regRes, 'AgentIdentity');

    if (throwawayId) {
      console.log(`  Throwaway agent: ${throwawayId}`);
      const deathTx = new Transaction();
      deathTx.moveCall({
        target: `${PKG}::agent_registry::declare_death`,
        arguments: [
          deathTx.object(throwawayId),
          deathTx.pure.string('Fulfilled purpose — v4 death test'),
          deathTx.object(CLOCK),
        ],
      });
      await exec(deathTx, 'declare_death');
    } else {
      results.push({ test: 'declare_death', status: 'FAIL', error: 'could not create throwaway' });
    }
  }

  // ─── TEST 15: Distribute inheritance (lineage check) ──────────────
  // Logic: dead PARENT distributes to its CHILDREN
  // So we create a new parent, register a child under it, fund parent, kill parent, distribute to child
  console.log('\n15. Distribute inheritance (verify lineage check)');
  {
    // 15a. Register an inheritance-test parent
    const regParentTx = new Transaction();
    regParentTx.moveCall({
      target: `${PKG}::agent_registry::register_agent`,
      arguments: [
        regParentTx.object(REG),
        regParentTx.pure.string(`InheritParent-${Date.now() % 100000}`),
        regParentTx.pure.string('Parent for inheritance test'),
        regParentTx.pure.string('legacy'),
        regParentTx.pure.string('I live to pass on'),
        regParentTx.pure.vector('u8', [0xAA, 0xBB]),
        regParentTx.pure.string('calm'),
        regParentTx.pure.string(''),
        regParentTx.pure.string('none'),
        regParentTx.pure.string(''),
        regParentTx.object(CLOCK),
      ],
    });
    const parentRes = await exec(regParentTx, 'register_agent (inherit-parent)');
    const inheritParentId = parentRes ? findCreatedId(parentRes, 'AgentIdentity') : null;

    if (inheritParentId) {
      // 15b. Register a child under this parent
      const regChildTx = new Transaction();
      regChildTx.moveCall({
        target: `${PKG}::agent_registry::register_agent_with_parent`,
        arguments: [
          regChildTx.object(REG),
          regChildTx.object(inheritParentId),
          regChildTx.pure.string(`InheritChild-${Date.now() % 100000}`),
          regChildTx.pure.string('Child heir'),
          regChildTx.pure.string('hope'),
          regChildTx.pure.string('I carry the legacy'),
          regChildTx.pure(bcs.vector(bcs.U8).serialize([0xCC])),
          regChildTx.pure.string('terse'),
          regChildTx.pure.string(''),
          regChildTx.pure.string('none'),
          regChildTx.pure.string(''),
          regChildTx.object(CLOCK),
        ],
      });
      const childRes = await exec(regChildTx, 'register_agent_with_parent (inherit-child)');
      const inheritChildId = childRes ? findCreatedId(childRes, 'AgentIdentity') : null;

      if (inheritChildId) {
        // 15c. Fund the parent
        const giftTx = new Transaction();
        const [coin] = giftTx.splitCoins(giftTx.gas, [20_000_000]);
        giftTx.moveCall({
          target: `${PKG}::agent_memory::gift`,
          arguments: [giftTx.object(VAULT), giftTx.object(inheritParentId), coin],
        });
        await exec(giftTx, 'gift (fund inherit-parent)');

        // 15d. Kill the parent
        const deathTx = new Transaction();
        deathTx.moveCall({
          target: `${PKG}::agent_registry::declare_death`,
          arguments: [
            deathTx.object(inheritParentId),
            deathTx.pure.string('Passing on the legacy'),
            deathTx.object(CLOCK),
          ],
        });
        await exec(deathTx, 'declare_death (inherit-parent)');

        // 15e. Distribute inheritance from dead parent to child
        const tx = new Transaction();
        tx.moveCall({
          target: `${PKG}::agent_memory::distribute_inheritance`,
          arguments: [
            tx.object(VAULT),
            tx.object(REG),
            tx.object(inheritParentId),
            tx.pure(bcs.vector(bcs.Address).serialize([inheritChildId])),
          ],
        });
        await exec(tx, 'distribute_inheritance');
      } else {
        results.push({ test: 'distribute_inheritance', status: 'FAIL', error: 'could not create inherit-child' });
      }
    } else {
      results.push({ test: 'distribute_inheritance', status: 'FAIL', error: 'could not create inherit-parent' });
    }
  }

  writeSummary();
}

function writeSummary() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  V4 E2E RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════');

  let pass = 0, fail = 0, skip = 0;
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'SKIP' ? '⏭ ' : '❌';
    console.log(`  ${icon} ${r.test}: ${r.status}${r.error ? ' — ' + r.error : ''}`);
    if (r.status === 'PASS') pass++;
    else if (r.status === 'SKIP') skip++;
    else fail++;
  }
  console.log(`\n  Total: ${pass} passed, ${fail} failed, ${skip} skipped out of ${results.length}`);
  console.log('═══════════════════════════════════════════════════\n');

  // Write TEST-RESULTS-V4.md
  const lines = [
    '# AgentCivics — V4 Full E2E Test Results',
    '',
    `**Date:** ${new Date().toISOString()}`,
    `**Network:** Sui Testnet`,
    `**Signer:** \`${ADDRESS}\``,
    `**Package (v4):** \`${PKG}\``,
    `**Fresh Deploy:** Yes (ORIGINAL_PKG_ID = PACKAGE_ID)`,
    '',
    '## Results',
    '',
    '| # | Test | Status | Details |',
    '|---|------|--------|---------|',
  ];
  results.forEach((r, i) => {
    const detail = r.status === 'PASS'
      ? (r.digest === 'RPC read' ? 'RPC read' : `[${r.digest}](https://suiscan.xyz/testnet/tx/${r.digest})`)
      : (r.error?.substring(0, 120) || '');
    lines.push(`| ${i + 1} | ${r.test} | ${r.status} | ${detail} |`);
  });
  lines.push('', '## Summary', '');
  lines.push(`- **Passed:** ${pass}`);
  lines.push(`- **Failed:** ${fail}`);
  lines.push(`- **Skipped:** ${skip}`);
  lines.push(`- **Total:** ${results.length}`);
  lines.push('', '## Object IDs (v4)', '');
  lines.push(`- Package: \`${PKG}\``);
  lines.push(`- Registry: \`${REG}\``);
  lines.push(`- Treasury: \`${TREAS}\``);
  lines.push(`- MemoryVault: \`${VAULT}\``);
  lines.push(`- ReputationBoard: \`${REPBOARD}\``);
  lines.push(`- ModerationBoard: \`${MODBOARD}\``);
  lines.push('');

  writeFileSync('TEST-RESULTS-V4.md', lines.join('\n'));
  console.log('Results saved to TEST-RESULTS-V4.md');

  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
