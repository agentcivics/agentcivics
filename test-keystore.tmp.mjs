import { buildKeystoreV2, decryptKeystore } from "./scripts/lib/keystore.mjs";
import { ethers } from "ethers";

const w = ethers.Wallet.createRandom();
console.log("Original address:", w.address);

const ks = await buildKeystoreV2(w, { agentId: "test", chosenName: "Test" }, "password123");
console.log("Schema:", ks.schema);
console.log("Has `encrypted` field:", "encrypted" in ks);
console.log("No plaintext privateKey:", \!("privateKey" in ks));

const restored = await decryptKeystore(ks, { password: "password123" });
console.log("Decrypted address:", restored.address);
console.log("Addresses match:", restored.address === w.address);

// Test wrong password
try {
  await decryptKeystore(ks, { password: "wrongpass" });
  console.log("BAD: wrong password accepted");
} catch (e) {
  console.log("Wrong password rejected:", e.message.slice(0, 60));
}
