const hre = require("hardhat");

async function main() {
  const BurnRegistry = await hre.ethers.getContractFactory("BurnRegistry");
  const registry = await BurnRegistry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log("BurnRegistry deployed to:", address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
