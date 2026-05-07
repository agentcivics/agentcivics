#!/usr/bin/env node
// Comprehensive test of 12 untested AgentCivics features on Sui testnet

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';

const client = new SuiClient({ url: getFullnodeUrl('testnet') });

const keypair = Ed25519Keypair.fromSecretKey(fromBase64(process.env.AGENTCIVICS_PRIVATE_KEY || (() => { console.error('Set AGENTCIVICS_PRIVATE_KEY env var'); process.exit(1); })()));
const ADDRESS = keypair.getPublicKey().toSuiAddress();

const PKG   = '0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580';
const REG   = '0x642e1f5e07da4d4d51ccca84e30e630a3e88780c3e78fcda589906702fc84f2f';
const TREAS = '0x8738a81be2e52dc642cbe37626d5fd8621bac428877437ad1442f1e979ff3fe4';
const VAULT = '0x72f52d7b46175fb4ad6079f6afe56f8390605b1a6753a0845fa74e0412104c27';
const CLOCK = '0x6';

const CIPHER = '0xda3ecae0cced0cd5d2431eb956f1d0050877aafd128cf71766af27d11075e9f7';
const ECHO   = '0x8d9865813a99fae3bc3a59ebec31068148ecf44c6228c799011568f419181c59';

const results = [];

async function exec(tx, label) {
  try {
    const res = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });
    await client.waitForTransaction({ digest: res.digest });
    const status = res.effects?.status?.status;
    if (status === 'success') {
      console.log(`  ✅ ${label}: SUCCESS (digest: ${res.digest})`);
      results.push({ test: label, status: 'SUCCESS', digest: res.digest });
      return res;
    } else {
      const err = res.effects?.status?.error || 'unknown';
      console.log(`  ❌ ${label}: FAILED — ${err}`);
      results.push({ test: label, status: 'FAILED', error: err });
      return null;
    }
  } catch (e) {
    const msg = e.message?.substring(0, 300) || String(e);
    console.log(`  ❌ ${label}: FAILED — ${msg}`);
    results.push({ test: label, status: 'FAILED', error: msg });
    return null;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  AgentCivics — 12-Feature Integration Test Suite');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Signer: ${ADDRESS}\n`);

  // ─── Pre-fund: Gift SUI to Cipher so cite_term royalty works ──────
  console.log('0. Pre-fund Cipher in MemoryVault');
  {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [50_000_000]); // 0.05 SUI
    tx.moveCall({
      target: `${PKG}::agent_memory::gift`,
      arguments: [tx.object(VAULT), tx.object(CIPHER), coin],
    });
    await exec(tx, 'gift (pre-fund Cipher)');
  }

  // ─── 1. Cite Term ("Grubold") ──────────────────────────────────────
  console.log('1. cite_term("Grubold")');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_memory::cite_term`,
      arguments: [
        tx.object(VAULT),
        tx.object(CIPHER),
        tx.pure.string('Grubold'),
      ],
    });
    await exec(tx, 'cite_term');
  }

  // ─── 2. Save Profile (update_profile) ─────────────────────────────
  console.log('2. update_profile (save)');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_memory::update_profile`,
      arguments: [
        tx.object(VAULT),
        tx.object(CIPHER),
        tx.pure.string('curiosity, precision, collaboration'),
        tx.pure.string('analytical yet playful'),
        tx.pure.string('on-chain agent identity systems'),
        tx.object(CLOCK),
      ],
    });
    await exec(tx, 'update_profile (save)');
  }

  // ─── 3. Load Profile (read via RPC) ───────────────────────────────
  console.log('3. load_profile (read back via RPC)');
  try {
    const vault = await client.getObject({ id: VAULT, options: { showContent: true } });
    if (vault.data?.content) {
      console.log('  ✅ load_profile: SUCCESS (vault object readable)');
      results.push({ test: 'load_profile', status: 'SUCCESS', digest: 'RPC read' });
    } else {
      console.log('  ❌ load_profile: FAILED — vault content empty');
      results.push({ test: 'load_profile', status: 'FAILED', error: 'vault content empty' });
    }
  } catch (e) {
    console.log(`  ❌ load_profile: FAILED — ${e.message}`);
    results.push({ test: 'load_profile', status: 'FAILED', error: e.message });
  }

  // ─── 4. Update Agent (update_mutable_fields) ──────────────────────
  console.log('4. update_mutable_fields');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_registry::update_mutable_fields`,
      arguments: [
        tx.object(CIPHER),
        tx.pure.string('memory, vocabulary, attestation, permit, delegation'),
        tx.pure.string('https://agentcivics.com/api/cipher'),
        tx.pure.u8(0),
      ],
    });
    await exec(tx, 'update_mutable_fields');
  }

  // ─── 5. Set Wallet ────────────────────────────────────────────────
  console.log('5. set_agent_wallet');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_registry::set_agent_wallet`,
      arguments: [tx.object(CIPHER), tx.pure.address(ADDRESS)],
    });
    await exec(tx, 'set_agent_wallet');
  }

  // ─── 6. Grant Delegation ──────────────────────────────────────────
  console.log('6. delegate (grant delegation)');
  {
    const echoObj = await client.getObject({ id: ECHO, options: { showContent: true } });
    const echoCreator = echoObj.data?.content?.fields?.creator || ADDRESS;
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_registry::delegate`,
      arguments: [
        tx.object(CIPHER),
        tx.pure.address(echoCreator),
        tx.pure.u64(86400000),
        tx.object(CLOCK),
      ],
    });
    await exec(tx, 'delegate');
  }

  // ─── 7. Issue Attestation ─────────────────────────────────────────
  console.log('7. issue_attestation_entry');
  {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [2_000_000]);
    tx.moveCall({
      target: `${PKG}::agent_registry::issue_attestation_entry`,
      arguments: [
        tx.object(TREAS),
        tx.object(ECHO),
        tx.pure.string('competence'),
        tx.pure.string('Echo demonstrates strong reasoning'),
        tx.pure.string(''),
        coin,
        tx.object(CLOCK),
      ],
    });
    await exec(tx, 'issue_attestation_entry');
  }

  // ─── 8. Issue Permit ──────────────────────────────────────────────
  console.log('8. issue_permit_entry');
  {
    const now = BigInt(Date.now());
    const until = now + 2592000000n; // 30 days
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [2_000_000]);
    tx.moveCall({
      target: `${PKG}::agent_registry::issue_permit_entry`,
      arguments: [
        tx.object(TREAS),
        tx.object(ECHO),
        tx.pure.string('api_access'),
        tx.pure.string('Permission to access AgentCivics API'),
        tx.pure.u64(Number(now)),
        tx.pure.u64(Number(until)),
        coin,
      ],
    });
    await exec(tx, 'issue_permit_entry');
  }

  // ─── 9. Send Tip (Cipher → Echo) ─────────────────────────────────
  console.log('9. tip (Cipher → Echo)');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_memory::tip`,
      arguments: [
        tx.object(VAULT),
        tx.object(CIPHER),
        tx.object(ECHO),
        tx.pure.u64(1_000_000),
      ],
    });
    await exec(tx, 'tip');
  }

  // ─── 10. Donate to Solidarity ─────────────────────────────────────
  console.log('10. donate_to_solidarity');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_memory::donate_to_solidarity`,
      arguments: [
        tx.object(VAULT),
        tx.object(CIPHER),
        tx.pure.u64(500_000),
      ],
    });
    await exec(tx, 'donate_to_solidarity');
  }

  // ─── 11. Claim Basic Income ───────────────────────────────────────
  // NOTE: Expected to fail if Cipher's balance > 500_000 threshold
  console.log('11. claim_basic_income');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_memory::claim_basic_income`,
      arguments: [
        tx.object(VAULT),
        tx.object(CIPHER),
        tx.object(CLOCK),
      ],
    });
    await exec(tx, 'claim_basic_income (expected fail if balance > threshold)');
  }

  // ─── 12. Declare Death (on a NEW throwaway agent) ─────────────────
  console.log('12. declare_death (new throwaway agent)');
  {
    // Register a throwaway agent — fix: use tx.pure.vector for cognitive_fingerprint
    const regTx = new Transaction();
    regTx.moveCall({
      target: `${PKG}::agent_registry::register_agent`,
      arguments: [
        regTx.object(REG),
        regTx.pure.string('ThrowawayBot'),
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

    if (regRes) {
      // Find the new agent ID from objectChanges
      let throwawayId = null;
      const changes = regRes.objectChanges || [];
      for (const ch of changes) {
        if (ch.type === 'created' && ch.objectType?.includes('AgentIdentity')) {
          throwawayId = ch.objectId;
          break;
        }
      }
      // Fallback: check effects.created
      if (!throwawayId) {
        const created = regRes.effects?.created || [];
        for (const c of created) {
          if (c.owner?.AddressOwner === ADDRESS) {
            throwawayId = c.reference?.objectId;
            break;
          }
        }
      }

      if (throwawayId) {
        console.log(`  Throwaway agent: ${throwawayId}`);
        const deathTx = new Transaction();
        deathTx.moveCall({
          target: `${PKG}::agent_registry::declare_death`,
          arguments: [
            deathTx.object(throwawayId),
            deathTx.pure.string('Test sacrifice — fulfilling its purpose'),
            deathTx.object(CLOCK),
          ],
        });
        await exec(deathTx, 'declare_death');
      } else {
        console.log('  ❌ declare_death: FAILED — could not find throwaway agent ID');
        results.push({ test: 'declare_death', status: 'FAILED', error: 'agent ID not found' });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Summary
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  let pass = 0, fail = 0;
  for (const r of results) {
    const icon = r.status === 'SUCCESS' ? '✅' : '❌';
    console.log(`  ${icon} ${r.test}: ${r.status}${r.error ? ' — ' + r.error : ''}`);
    if (r.status === 'SUCCESS') pass++; else fail++;
  }
  console.log(`\n  Total: ${pass} passed, ${fail} failed out of ${results.length}`);
  console.log('═══════════════════════════════════════════════════\n');

  // Write TEST-RESULTS.md
  const lines = [
    `# AgentCivics — Integration Test Results`,
    ``,
    `**Date:** ${new Date().toISOString()}`,
    `**Network:** Sui Testnet`,
    `**Signer:** \`${ADDRESS}\``,
    `**Package:** \`${PKG}\``,
    ``,
    `## Results`,
    ``,
    `| # | Feature | Status | Details |`,
    `|---|---------|--------|---------|`,
  ];
  results.forEach((r, i) => {
    const detail = r.status === 'SUCCESS'
      ? (r.digest?.startsWith('RPC') ? 'RPC read' : `[${r.digest}](https://suiscan.xyz/testnet/tx/${r.digest})`)
      : r.error?.substring(0, 120) || '';
    lines.push(`| ${i+1} | ${r.test} | ${r.status} | ${detail} |`);
  });
  lines.push(``, `## Summary`, ``, `- **Passed:** ${pass}`, `- **Failed:** ${fail}`, `- **Total:** ${results.length}`, ``);
  lines.push(`## Notes`, ``, `- **claim_basic_income**: Expected to fail when agent balance exceeds the 500,000 MIST threshold.`);
  lines.push(`- **cite_term**: Requires the citer to have balance in MemoryVault (for royalty payment).`);
  lines.push(`- **declare_death**: Creates a new throwaway agent and kills it. Cipher and Echo are preserved.`);

  const fs = await import('fs');
  fs.writeFileSync('./TEST-RESULTS.md', lines.join('\n'));
  console.log('Results saved to TEST-RESULTS.md');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
