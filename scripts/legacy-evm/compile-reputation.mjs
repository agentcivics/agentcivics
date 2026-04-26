import solc from 'solc';
import fs from 'fs';
import path from 'path';

const contractPath = path.resolve('contracts/AgentReputation.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
  language: 'Solidity',
  sources: { 'AgentReputation.sol': { content: source } },
  settings: {
    viaIR: true,
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } }
  }
};

console.log('Compiling AgentReputation.sol...\n');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  let hasError = false;
  for (const err of output.errors) {
    console.log(`[${err.severity}] ${err.formattedMessage}`);
    if (err.severity === 'error') hasError = true;
  }
  if (hasError) { console.log('Compilation FAILED.'); process.exit(1); }
}

const buildDir = './build';
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

for (const [_, contracts] of Object.entries(output.contracts || {})) {
  for (const [contractName, contract] of Object.entries(contracts)) {
    fs.writeFileSync(path.join(buildDir, `${contractName}.abi.json`), JSON.stringify(contract.abi, null, 2));
    const bytecode = contract.evm?.bytecode?.object || '';
    fs.writeFileSync(path.join(buildDir, `${contractName}.bin`), bytecode);
    const deployedSize = (contract.evm?.deployedBytecode?.object || '').length / 2;
    console.log(`${contractName}: ${contract.abi.length} ABI entries, ${deployedSize} bytes deployed (${((deployedSize/24576)*100).toFixed(1)}%)`);
    if (deployedSize > 24576) console.log(`  ⚠ EXCEEDS EIP-170!`);
  }
}
console.log('\nCompilation SUCCEEDED.');
