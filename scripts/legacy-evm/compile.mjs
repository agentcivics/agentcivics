import solc from 'solc';
import fs from 'fs';
import path from 'path';

const contractPath = path.resolve('contracts/AgentRegistry.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'AgentRegistry.sol': { content: source }
  },
  settings: {
    viaIR: true,
    optimizer: {
      enabled: true,
      runs: 200,
    },
    evmVersion: 'paris',
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.bytecode.opcodes', 'metadata']
      }
    }
  }
};

console.log('Compiling AgentRegistry.sol with solc 0.8.24 (viaIR + optimizer)...\n');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

// Check for errors
if (output.errors) {
  let hasError = false;
  for (const err of output.errors) {
    console.log(`[${err.severity}] ${err.formattedMessage}`);
    if (err.severity === 'error') hasError = true;
  }
  if (hasError) {
    console.log('\nCompilation FAILED.');
    process.exit(1);
  }
}

// Write artifacts
const buildDir = './build';
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

for (const [fileName, contracts] of Object.entries(output.contracts || {})) {
  for (const [contractName, contract] of Object.entries(contracts)) {
    const abiPath = path.join(buildDir, `${contractName}.abi.json`);
    const binPath = path.join(buildDir, `${contractName}.bin`);

    fs.writeFileSync(abiPath, JSON.stringify(contract.abi, null, 2));

    const bytecode = contract.evm?.bytecode?.object || '';
    fs.writeFileSync(binPath, bytecode);

    const deployedBytecode = contract.evm?.deployedBytecode?.object || '';

    console.log(`Contract: ${contractName}`);
    console.log(`  ABI: ${abiPath} (${contract.abi.length} functions/events)`);
    console.log(`  Init bytecode: ${bytecode.length / 2} bytes (${bytecode.length} hex chars)`);
    console.log(`  Deployed bytecode: ${deployedBytecode.length / 2} bytes`);

    // Check EIP-170 limit (24,576 bytes)
    const deployedSize = deployedBytecode.length / 2;
    if (deployedSize > 24576) {
      console.log(`  ⚠ WARNING: Exceeds EIP-170 limit of 24,576 bytes by ${deployedSize - 24576} bytes!`);
    } else {
      console.log(`  ✓ Within EIP-170 limit (${((deployedSize / 24576) * 100).toFixed(1)}% used)`);
    }
    console.log('');
  }
}

console.log('Compilation SUCCEEDED.');
