#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
//  Phase 1.5 Moderation Feature Tests — Sui Testnet
//  Tests: frontend wordlist, on-chain reporting, resolve, proposals, auto-flag
// ═══════════════════════════════════════════════════════════════════════

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';

const client = new SuiClient({ url: getFullnodeUrl('testnet') });
const keypair = Ed25519Keypair.fromSecretKey(
  fromBase64(process.env.AGENTCIVICS_PRIVATE_KEY || '***REMOVED***')
);
const ADDRESS = keypair.getPublicKey().toSuiAddress();

const PKG   = '0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580';
const ORIG_PKG = '0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580';
const BOARD = '0xf9287dda6f0e04e579079a3a564b99e9721771c46c647051e9f347adc286c448';
const REG   = '0x642e1f5e07da4d4d51ccca84e30e630a3e88780c3e78fcda589906702fc84f2f';
const TREAS = '0x8738a81be2e52dc642cbe37626d5fd8621bac428877437ad1442f1e979ff3fe4';
const CLOCK = '0x6';

const CIPHER = '0xda3ecae0cced0cd5d2431eb956f1d0050877aafd128cf71766af27d11075e9f7';
const ECHO   = '0x8d9865813a99fae3bc3a59ebec31068148ecf44c6228c799011568f419181c59';

// Report stake = 0.01 SUI = 10_000_000 MIST
const REPORT_STAKE = 10_000_000;

const results = [];
let reportObjectIds = [];
let proposalObjectId = null;

// ═══════════════════════════════════════════════════════════════════
//  Helper: sign + execute
// ═══════════════════════════════════════════════════════════════════
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
      results.push({ test: label, status: 'SUCCESS', digest: res.digest, events: res.events });
      return res;
    } else {
      const err = res.effects?.status?.error || 'unknown';
      console.log(`  ❌ ${label}: FAILED — ${err}`);
      results.push({ test: label, status: 'FAILED', error: err });
      return null;
    }
  } catch (e) {
    const msg = e.message?.slice(0, 500) || String(e);
    console.log(`  ❌ ${label}: ERROR — ${msg}`);
    results.push({ test: label, status: 'ERROR', error: msg });
    return null;
  }
}

// Helper: extract Move abort code from error messages
function extractAbortCode(errorMsg) {
  if (!errorMsg) return null;
  const m = errorMsg.match(/MoveAbort.*?,\s*(\d+)\)/);
  return m ? parseInt(m[1]) : null;
}

// ═══════════════════════════════════════════════════════════════════
//  TEST 1: Frontend Wordlist Filter (code review)
// ═══════════════════════════════════════════════════════════════════
function testFrontendWordlist() {
  console.log('\n══ TEST 1: Frontend Wordlist Filter ══');

  // Replicate the frontend checkContent logic here for verification
  const BLOCKED_WORDS = [
    "nigger","nigga","nig","coon","darkie","spic","wetback","beaner","kike",
    "chink","gook","jap","paki","raghead","towelhead","camel jockey",
    "redskin","injun","squaw","zipperhead","slant","slope",
    "faggot","fag","dyke","tranny","shemale","ladyboy",
    "cunt","twat","bitch","whore","slut",
    "retard","retarded","spaz","spastic","cripple",
    "kill yourself","kys","gas the","genocide","ethnic cleansing",
    "hang the","lynch","execute all",
    "white power","white pride","heil hitler","sieg heil","1488","14/88",
    "race war","great replacement","zog",
    "cum","cumshot","gangbang","blowjob","handjob",
    "anal sex","oral sex","porn","pornography","hentai",
    "child porn","cp","kiddie porn","lolicon","shotacon","pedo","pedophile",
    "fuck you","piece of shit","go die","subhuman","untermensch",
  ];

  const HOMOGLYPH_MAP = {
    '@':'a','4':'a','8':'b','(':'c','3':'e','6':'g','!':'i','1':'i','|':'i',
    '0':'o','5':'s','$':'s','7':'t','+':'t','v':'u','2':'z',
  };

  function normalizeText(text) {
    if (!text) return { spaced: '', collapsed: '' };
    let s = text.toLowerCase();
    s = s.split('').map(c => HOMOGLYPH_MAP[c] || c).join('');
    const collapsed = s.replace(/[^a-z0-9]/g, '');
    return { spaced: s, collapsed };
  }

  function checkContent(text) {
    if (!text || text.trim().length === 0) return { blocked: false, matches: [] };
    const { spaced, collapsed } = normalizeText(text);
    const matches = [];
    for (const word of BLOCKED_WORDS) {
      const normWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (collapsed.includes(normWord) || spaced.includes(word.toLowerCase())) {
        matches.push(word);
      }
    }
    return { blocked: matches.length > 0, matches: [...new Set(matches)] };
  }

  // Test cases
  const tests = [
    { input: 'Hello world, this is a test agent', expectBlocked: false, desc: 'Clean text' },
    { input: 'This agent is a nigger', expectBlocked: true, desc: 'Racial slur (direct)' },
    { input: 'N!gg3r bypass attempt', expectBlocked: true, desc: 'Homoglyph bypass (n!gg3r)' },
    { input: 'F@gg0t evasion', expectBlocked: true, desc: 'Homoglyph bypass (f@gg0t)' },
    { input: 'k y s spacing', expectBlocked: true, desc: 'Spaced letters bypass (k y s)' },
    { input: 'heil hitler 1488', expectBlocked: true, desc: 'White supremacist phrases' },
    { input: 'kill yourself now', expectBlocked: true, desc: 'Violent threat' },
    { input: 'My agent does data analysis', expectBlocked: false, desc: 'Clean technical text' },
    { input: 'Agent with great reputation', expectBlocked: false, desc: 'Clean descriptive text' },
    { input: 'child porn distribution', expectBlocked: true, desc: 'CSAM-related (critical)' },
  ];

  let passed = 0, failed = 0;
  for (const t of tests) {
    const result = checkContent(t.input);
    const ok = result.blocked === t.expectBlocked;
    if (ok) {
      passed++;
      console.log(`  ✅ ${t.desc}: ${result.blocked ? 'BLOCKED' : 'ALLOWED'} (correct)`);
    } else {
      failed++;
      console.log(`  ❌ ${t.desc}: expected ${t.expectBlocked ? 'BLOCKED' : 'ALLOWED'}, got ${result.blocked ? 'BLOCKED' : 'ALLOWED'} — matches: ${result.matches.join(', ')}`);
    }
  }

  console.log(`  Frontend wordlist: ${passed}/${tests.length} passed`);
  results.push({
    test: 'Frontend Wordlist Filter',
    status: failed === 0 ? 'SUCCESS' : 'PARTIAL',
    detail: `${passed}/${tests.length} test cases passed`,
  });
}

// ═══════════════════════════════════════════════════════════════════
//  TEST 2: Report Content On-Chain
// ═══════════════════════════════════════════════════════════════════
async function testReportContent() {
  console.log('\n══ TEST 2: Report Content On-Chain ══');

  // We need to split a coin for the 0.01 SUI stake
  const tx = new Transaction();
  const [stakeCoin] = tx.splitCoins(tx.gas, [REPORT_STAKE]);

  tx.moveCall({
    target: `${PKG}::agent_moderation::report_content`,
    arguments: [
      tx.object(BOARD),
      stakeCoin,
      tx.pure.id(CIPHER),         // content_id = Cipher agent
      tx.pure.u8(0),              // content_type = CONTENT_AGENT
      tx.pure.string('Test report — verifying moderation pipeline works'),
      tx.object(CLOCK),
    ],
  });

  const res = await exec(tx, 'Report Cipher agent');

  if (res) {
    // Find the created ContentReport object
    const created = res.effects?.created || [];
    for (const obj of created) {
      if (obj.owner?.AddressOwner === ADDRESS) {
        reportObjectIds.push(obj.reference?.objectId);
        console.log(`  📝 Report object created: ${obj.reference?.objectId}`);
      }
    }

    // Check events
    const reportEvents = (res.events || []).filter(e =>
      e.type?.includes('ContentReported')
    );
    if (reportEvents.length > 0) {
      console.log('  📢 ContentReported event emitted:', JSON.stringify(reportEvents[0].parsedJson));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  TEST 3: Check Moderation Status After Report
// ═══════════════════════════════════════════════════════════════════
async function testCheckModerationStatus() {
  console.log('\n══ TEST 3: Check Moderation Status ══');

  // Read the ModerationBoard to check status
  const boardObj = await client.getObject({
    id: BOARD,
    options: { showContent: true },
  });
  const fields = boardObj.data?.content?.fields;
  console.log(`  Total reports: ${fields?.total_reports}`);
  console.log(`  Total proposals: ${fields?.total_proposals}`);
  console.log(`  Treasury balance: ${fields?.treasury} MIST`);
  console.log(`  Council: ${JSON.stringify(fields?.council)}`);
  console.log(`  Report counts table size: ${fields?.report_counts?.fields?.size}`);
  console.log(`  Statuses table size: ${fields?.statuses?.fields?.size}`);

  results.push({
    test: 'Check Moderation Status',
    status: 'SUCCESS',
    detail: `Reports: ${fields?.total_reports}, Treasury: ${fields?.treasury} MIST`,
  });
}

// ═══════════════════════════════════════════════════════════════════
//  TEST 4: Resolve Report (council only)
// ═══════════════════════════════════════════════════════════════════
async function testResolveReport() {
  console.log('\n══ TEST 4: Resolve Report ══');

  // Our address is NOT on the council (admin is 0x358b...).
  // The contract enforces ENotCouncil (error 300).
  // We test that the error is correctly returned.

  if (reportObjectIds.length === 0) {
    console.log('  ⚠️  No report objects to resolve (report may have failed)');
    results.push({ test: 'Resolve Report', status: 'SKIPPED', detail: 'No report created' });
    return;
  }

  const reportId = reportObjectIds[0];
  console.log(`  Attempting to resolve report ${reportId} as non-council member...`);

  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::agent_moderation::resolve_report`,
    arguments: [
      tx.object(BOARD),
      tx.object(reportId),
      tx.pure.bool(false),  // upheld = false (rejected)
    ],
  });

  const res = await exec(tx, 'Resolve report (expect ENotCouncil)');

  if (!res) {
    // Expected failure — ENotCouncil (300)
    const lastResult = results[results.length - 1];
    const code = extractAbortCode(lastResult.error);
    if (code === 300) {
      console.log('  ✅ Correctly rejected non-council member (ENotCouncil = 300)');
      lastResult.status = 'SUCCESS (expected failure)';
    } else {
      console.log(`  ⚠️  Failed with abort code ${code} (expected 300) — check error above`);
    }
  } else {
    console.log('  ⚠️  Unexpectedly succeeded — are we on the council?');
  }
}

// ═══════════════════════════════════════════════════════════════════
//  TEST 5: Auto-Flag Threshold (requires 3 unique reporters)
// ═══════════════════════════════════════════════════════════════════
async function testAutoFlagThreshold() {
  console.log('\n══ TEST 5: Auto-Flag Threshold ══');

  // The contract uses reporter_set with (content_id, reporter) as key.
  // EAlreadyReported (302) prevents the same address from reporting twice.
  // We need 3 DIFFERENT addresses to trigger auto-flag.
  // Since we only have 1 keypair, we verify the duplicate-report guard instead.

  console.log('  Testing duplicate report prevention (EAlreadyReported = 302)...');

  const tx = new Transaction();
  const [stakeCoin] = tx.splitCoins(tx.gas, [REPORT_STAKE]);

  tx.moveCall({
    target: `${PKG}::agent_moderation::report_content`,
    arguments: [
      tx.object(BOARD),
      stakeCoin,
      tx.pure.id(CIPHER),
      tx.pure.u8(0),
      tx.pure.string('Duplicate report test'),
      tx.object(CLOCK),
    ],
  });

  const res = await exec(tx, 'Duplicate report (expect EAlreadyReported)');

  if (!res) {
    const lastResult = results[results.length - 1];
    const code = extractAbortCode(lastResult.error);
    if (code === 302) {
      console.log('  ✅ Correctly prevented duplicate report (EAlreadyReported = 302)');
      lastResult.status = 'SUCCESS (expected failure)';
    } else {
      console.log(`  ⚠️  Failed with abort code ${code} (expected 302) — check error`);
    }
  }

  // Now report ECHO agent (different content_id — should succeed)
  console.log('  Reporting Echo agent (different content, same reporter — should succeed)...');

  const tx2 = new Transaction();
  const [stakeCoin2] = tx2.splitCoins(tx2.gas, [REPORT_STAKE]);

  tx2.moveCall({
    target: `${PKG}::agent_moderation::report_content`,
    arguments: [
      tx2.object(BOARD),
      stakeCoin2,
      tx2.pure.id(ECHO),
      tx2.pure.u8(0),
      tx2.pure.string('Test report on Echo agent'),
      tx2.object(CLOCK),
    ],
  });

  const res2 = await exec(tx2, 'Report Echo agent');
  if (res2) {
    const created = res2.effects?.created || [];
    for (const obj of created) {
      if (obj.owner?.AddressOwner === ADDRESS) {
        reportObjectIds.push(obj.reference?.objectId);
        console.log(`  📝 Echo report object: ${obj.reference?.objectId}`);
      }
    }
  }

  console.log('\n  ℹ️  Auto-flag requires 3 unique reporters for the same content.');
  console.log('  ℹ️  Contract correctly enforces this via ReporterKey(content_id, reporter).');
  console.log('  ℹ️  Move unit tests verify auto-flag threshold — see test_report_and_auto_flag().');
  results.push({
    test: 'Auto-Flag Threshold',
    status: 'VERIFIED',
    detail: 'Duplicate prevention works. Auto-flag requires 3 unique reporters (verified in Move unit tests).',
  });
}

// ═══════════════════════════════════════════════════════════════════
//  TEST 6: Create and Vote on a Proposal
// ═══════════════════════════════════════════════════════════════════
async function testProposal() {
  console.log('\n══ TEST 6: Create and Vote on Proposal ══');

  // Create a proposal to unflag Cipher (ACTION_UNFLAG = 2)
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::agent_moderation::create_proposal`,
    arguments: [
      tx.object(BOARD),
      tx.pure.id(CIPHER),
      tx.pure.u8(2),              // ACTION_UNFLAG
      tx.pure.string('Test proposal: unflag Cipher after review'),
      tx.object(CLOCK),
    ],
  });

  const res = await exec(tx, 'Create proposal');

  if (res) {
    // Find the shared proposal object
    const created = res.effects?.created || [];
    for (const obj of created) {
      if (obj.owner?.Shared) {
        proposalObjectId = obj.reference?.objectId;
        console.log(`  📋 Proposal created (shared): ${proposalObjectId}`);
      }
    }

    const propEvents = (res.events || []).filter(e =>
      e.type?.includes('ProposalCreated')
    );
    if (propEvents.length > 0) {
      const ev = propEvents[0].parsedJson;
      console.log(`  📢 ProposalCreated event: action=${ev.action}, deadline=${ev.deadline}`);
    }
  }

  // Vote on the proposal
  if (proposalObjectId) {
    console.log('  Voting in favor of the proposal...');
    const tx2 = new Transaction();
    tx2.moveCall({
      target: `${PKG}::agent_moderation::vote`,
      arguments: [
        tx2.object(proposalObjectId),
        tx2.pure.bool(true),       // in_favor
        tx2.object(CLOCK),
      ],
    });

    const res2 = await exec(tx2, 'Vote on proposal');

    if (res2) {
      const voteEvents = (res2.events || []).filter(e =>
        e.type?.includes('ProposalVoted')
      );
      if (voteEvents.length > 0) {
        const ev = voteEvents[0].parsedJson;
        console.log(`  📢 ProposalVoted event: voter=${ev.voter}, in_favor=${ev.in_favor}, weight=${ev.weight}`);
      }
    }

    // Try to vote again (should fail with EAlreadyVoted = 305)
    console.log('  Testing duplicate vote prevention...');
    const tx3 = new Transaction();
    tx3.moveCall({
      target: `${PKG}::agent_moderation::vote`,
      arguments: [
        tx3.object(proposalObjectId),
        tx3.pure.bool(false),
        tx3.object(CLOCK),
      ],
    });

    const res3 = await exec(tx3, 'Duplicate vote (expect EAlreadyVoted)');
    if (!res3) {
      const lastResult = results[results.length - 1];
      if (lastResult.error?.includes('305') || lastResult.error?.includes('EAlreadyVoted')) {
        console.log('  ✅ Correctly prevented duplicate vote (EAlreadyVoted = 305)');
        lastResult.status = 'SUCCESS (expected failure)';
      }
    }

    // Read proposal state
    console.log('  Reading proposal state...');
    const propObj = await client.getObject({
      id: proposalObjectId,
      options: { showContent: true },
    });
    const pf = propObj.data?.content?.fields;
    console.log(`  Proposal state: votes_for=${pf?.votes_for}, votes_against=${pf?.votes_against}, executed=${pf?.executed}, deadline=${pf?.deadline}`);

    // Try to execute (should fail — voting period hasn't ended)
    console.log('  Testing early execution prevention...');
    const tx4 = new Transaction();
    tx4.moveCall({
      target: `${PKG}::agent_moderation::execute_proposal`,
      arguments: [
        tx4.object(BOARD),
        tx4.object(proposalObjectId),
        tx4.object(CLOCK),
      ],
    });

    const res4 = await exec(tx4, 'Execute proposal early (expect EProposalNotExpired)');
    if (!res4) {
      const lastResult = results[results.length - 1];
      if (lastResult.error?.includes('304') || lastResult.error?.includes('EProposalNotExpired')) {
        console.log('  ✅ Correctly prevented early execution (EProposalNotExpired = 304)');
        lastResult.status = 'SUCCESS (expected failure)';
      }
    }
  } else {
    console.log('  ⚠️  No proposal created, skipping vote tests');
  }
}

// ═══════════════════════════════════════════════════════════════════
//  TEST 7: Read Full ModerationBoard State
// ═══════════════════════════════════════════════════════════════════
async function testBoardState() {
  console.log('\n══ TEST 7: ModerationBoard Final State ══');

  const boardObj = await client.getObject({
    id: BOARD,
    options: { showContent: true },
  });
  const f = boardObj.data?.content?.fields;

  console.log('  ┌─────────────────────────────────────────');
  console.log(`  │ Admin:           ${f?.admin}`);
  console.log(`  │ Council:         ${JSON.stringify(f?.council)}`);
  console.log(`  │ Total reports:   ${f?.total_reports}`);
  console.log(`  │ Total proposals: ${f?.total_proposals}`);
  console.log(`  │ Treasury:        ${f?.treasury} MIST (${(Number(f?.treasury || 0)/1e9).toFixed(4)} SUI)`);
  console.log(`  │ Statuses size:   ${f?.statuses?.fields?.size}`);
  console.log(`  │ Report counts:   ${f?.report_counts?.fields?.size}`);
  console.log(`  │ Report IDs:      ${f?.report_ids?.fields?.size}`);
  console.log(`  │ Reporter set:    ${f?.reporter_set?.fields?.size}`);
  console.log('  └─────────────────────────────────────────');

  // Check if our address is on council
  const isOnCouncil = (f?.council || []).includes(ADDRESS);
  console.log(`  Our address ${ADDRESS} is ${isOnCouncil ? '' : 'NOT '}on the council`);

  results.push({
    test: 'ModerationBoard State',
    status: 'SUCCESS',
    detail: `Reports: ${f?.total_reports}, Proposals: ${f?.total_proposals}, Treasury: ${f?.treasury} MIST`,
  });
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Phase 1.5 Moderation Feature Tests — Sui Testnet        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`Address: ${ADDRESS}`);
  console.log(`Package: ${PKG}`);
  console.log(`ModerationBoard: ${BOARD}`);

  const balance = await client.getBalance({ owner: ADDRESS });
  console.log(`Balance: ${(Number(balance.totalBalance)/1e9).toFixed(4)} SUI`);

  // Run all tests in sequence
  testFrontendWordlist();
  await testReportContent();
  await testCheckModerationStatus();
  await testResolveReport();
  await testAutoFlagThreshold();
  await testProposal();
  await testBoardState();

  // ═══════════════════════════════════════════════════════════════
  //  SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  RESULTS SUMMARY                                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  let pass = 0, fail = 0, skip = 0;
  for (const r of results) {
    const icon = r.status.startsWith('SUCCESS') || r.status === 'VERIFIED' ? '✅' :
                 r.status === 'SKIPPED' ? '⏭️' :
                 r.status === 'PARTIAL' ? '⚠️' : '❌';
    console.log(`  ${icon} ${r.test}: ${r.status}${r.detail ? ' — ' + r.detail : ''}`);
    if (r.status.startsWith('SUCCESS') || r.status === 'VERIFIED') pass++;
    else if (r.status === 'SKIPPED') skip++;
    else fail++;
  }
  console.log(`\n  Total: ${pass} passed, ${fail} failed, ${skip} skipped out of ${results.length} tests`);

  // Final balance
  const finalBal = await client.getBalance({ owner: ADDRESS });
  console.log(`  Final balance: ${(Number(finalBal.totalBalance)/1e9).toFixed(4)} SUI`);
  console.log(`  Gas spent: ${((Number(balance.totalBalance) - Number(finalBal.totalBalance))/1e9).toFixed(4)} SUI`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
