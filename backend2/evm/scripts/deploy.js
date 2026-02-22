// Deploy Escrow contract to XRPL EVM Sidechain
//
// Usage:
//   DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/deploy.cjs --network xrplEvmTestnet
//
// The deployer address becomes the "platform" (usage oracle).

async function main() {
  const { ethers } = require("hardhat");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying Escrow with platform address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "XRP");

  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy(deployer.address);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("\n✅ Escrow deployed to:", address);
  console.log("   Network: XRPL EVM Sidechain Testnet");
  console.log("   Chain ID: 1440002");
  console.log("   Explorer: https://explorer.xrplsidechain.peersyst.tech/address/" + address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
