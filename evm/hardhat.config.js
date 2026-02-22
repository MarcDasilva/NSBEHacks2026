require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.19",
  networks: {
    // Local Hardhat network (default for tests)
    hardhat: {},

    // XRPL EVM Sidechain Testnet — uses XRP as native gas token
    xrplEvmTestnet: {
      url: "https://rpc-evm-sidechain.xrpl.org",
      chainId: 1440002,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
  mocha: {
    timeout: 30000,
  },
};
