/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    "xrplevm-testnet": {
      url: process.env.XRPL_EVM_RPC || "https://xrplevm-testnet.buildintheshade.com",
      chainId: 1440002,
    },
    "xrplevm-mainnet": {
      url: process.env.XRPL_EVM_RPC || "https://rpc.xrplevm.org",
      chainId: 1440001,
    },
  },
};
