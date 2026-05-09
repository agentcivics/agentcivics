#!/usr/bin/env node
// Test 3: Inheritance — standalone retry with minimal gas usage
// Cipher already has vault balance from previous run. Just test inheritance flow.

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';

const NETWORK = process.env.AGENTCIVICS_NETWORK || 'devnet';
const client = new SuiClient({ url: process.env.AGENTCIVICS_RPC_URL || getFullnodeUrl(NETWORK) });
const SECRET = process.env.AGENTCIVICS_PRIVATE_KEY;
if (!SECRET) { console.error('Set AGENTCIVICS_PRIVATE_KEY env var (base64 Ed25519 secret).'); process.exit(1); }
const keypair = Ed25519Keypair.fromSecretKey(fromBase64(SECRET));
const ADDRESS = keypair.getPublicKey().toSuiAddress();

const PKG   = '0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580';
const REG   = '0x642e1f5e07da4d4d51ccca84e30e630a3e88780c3e78fcda589906702fc84f2f';
const VAULT = '0x72f52d7b46175fb4ad6079f6afe56f8390605b1a6753a0845fa74e0412104c27';
const CLOCK = '0x6';
const CIPHER = '0xda3ecae0cced0cd5d2431eb956f1d0050877aafd128cf71766af27d11075e9f7';
const ECHO   = '0x8d9865813a99fae3bc3a59ebec31068148ecf44c6228c799011568f419181c59';

async function exec(tx, label) {
  try {
    tx.setGasBudget(50_000_000);
    const res = await client.signAndExecuteTransaction({
      signer: keypair, transaction: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });
    await client.waitForTransaction({ digest: res.digest });
    const status = res.effects?.status?.status;
    if (status === 'success') {
      console.log(`  ✅ ${label}: SUCCESS (${res.digest})`);
      return res;
    } else {
      console.log(`  ❌ ${label}: FAILED — ${res.effects?.status?.error}`);
      return null;
    }
  } catch (e) {
    console.log(`  ❌ ${label}: FAILED — ${e.message?.substring(0, 400)}`);
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
    const result = await client.devInspectTransactionBlock({ transactionBlock: tx, sender: ADDRESS });
    const rv = result?.results?.[0]?.returnValues;
    if (rv && rv.length > 0) {
      const buf = new Uint8Array(rv[0][0]);
      let val = 0n;
      for (let i = 7; i >= 0; i--) val = (val << 8n) | BigInt(buf[i]);
      return Number(val);
    }
  } catch {}
  return 0;
}

async function main() {
  console.log('══ TEST 3: Inheritance (retry) ══');

  // Check wallet balance first
  const coins = await client.getCoins({ owner: ADDRESS });
  const totalGas = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
  console.log(`  Wallet gas: ${totalGas} MIST (${Number(totalGas)/1e9} SUI)`);

  // Use Cipher's existing vault balance to tip the throwaway agent
  // instead of gifting fresh SUI (which costs gas for splitCoins).
  // Actually, gift still needs splitCoins. Let's use tip from Cipher instead.

  // 3a. Create throwaway agent with Cipher as parent
  console.log('  3a. Creating throwaway agent...');
  let throwawayId = null;
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_registry::register_agent_with_parent`,
      arguments: [
        tx.object(REG),
        tx.object(CIPHER),
        tx.pure.string('Ephemeron2'),
        tx.pure.string('Temporary agent for inheritance test'),
        tx.pure.string('impermanence'),
        tx.pure.string('Born to pass forward'),
        tx.pure(bcs.vector(bcs.U8).serialize([42, 99])),
        tx.pure.string('quiet'),
        tx.pure.string(''),
        tx.pure.string('none'),
        tx.pure.string(''),
        tx.object(CLOCK),
      ],
    });
    const res = await exec(tx, 'register_agent_with_parent');
    if (res) {
      throwawayId = findCreatedId(res, 'AgentIdentity');
      console.log(`  Throwaway: ${throwawayId}`);
    }
  }
  if (!throwawayId) { console.log('  ABORT: could not create agent'); return; }

  // 3b. Use tip from Cipher to fund throwaway (no splitCoins needed)
  console.log('  3b. Cipher tips throwaway agent...');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_memory::tip`,
      arguments: [
        tx.object(VAULT),
        tx.object(CIPHER),
        tx.object(throwawayId),
        tx.pure.u64(2_000_000), // 0.002 SUI from Cipher's vault balance
      ],
    });
    await exec(tx, 'tip (Cipher → Ephemeron2)');
  }
  const throwBal = await inspectBalance(throwawayId);
  console.log(`  Ephemeron2 balance: ${throwBal}`);

  const echoBalBefore = await inspectBalance(ECHO);
  console.log(`  Echo balance before: ${echoBalBefore}`);

  // 3c. Declare death
  console.log('  3c. Declaring death...');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_registry::declare_death`,
      arguments: [
        tx.object(throwawayId),
        tx.pure.string('Fulfilled purpose'),
        tx.object(CLOCK),
      ],
    });
    await exec(tx, 'declare_death');
  }

  // 3d. Distribute inheritance to Echo
  console.log('  3d. Distributing inheritance to Echo...');
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PKG}::agent_memory::distribute_inheritance`,
      arguments: [
        tx.object(VAULT),
        tx.object(throwawayId),
        tx.pure(bcs.vector(bcs.Address).serialize([ECHO])),
      ],
    });
    await exec(tx, 'distribute_inheritance');
  }

  // 3e. Verify
  const echoBalAfter = await inspectBalance(ECHO);
  console.log(`  Echo balance after: ${echoBalAfter}`);
  const increased = echoBalAfter > echoBalBefore;
  console.log(`  Balance increased by: ${echoBalAfter - echoBalBefore}`);
  console.log(increased ? '  ✅ TEST 3 INHERITANCE: SUCCESS' : '  ❌ TEST 3 INHERITANCE: FAIL');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
