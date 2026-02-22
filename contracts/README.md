# Burn Registry (XRPL EVM)

Records XRPL L1 burn transaction hashes on the XRPL EVM sidechain for transparency and auditability.

## Contract

- **BurnRegistry.sol** — Permissionless registry: anyone can call `recordBurn(xrplTxHash, amountWei, tokenSymbol)` to record a burn that occurred on XRPL L1. Prevents duplicate records per tx hash.

## Build & deploy

```bash
cd contracts
npm install
npm run compile
# Set XRPL_EVM_RPC and a funded private key for deployer (e.g. in .env)
npx hardhat run scripts/deploy.js --network xrplevm-testnet
```

Then set `NEXT_PUBLIC_BURN_REGISTRY_ADDRESS` in the frontend (and optionally `NEXT_PUBLIC_XRPL_EVM_CHAIN_ID`, default 1440002 for testnet).

## Networks

- **xrplevm-testnet**: https://xrplevm-testnet.buildintheshade.com (chain id 1440002)
- **xrplevm-mainnet**: https://rpc.xrplevm.org (chain id 1440001)
