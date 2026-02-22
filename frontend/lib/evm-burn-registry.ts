/**
 * XRPL EVM Burn Registry — record L1 burn tx hashes on-chain for transparency.
 * Uses BurnRegistry.sol on XRPL EVM sidechain. Optional: user pays gas via MetaMask.
 */

const BURN_REGISTRY_ABI = [
  {
    inputs: [
      { name: "xrplTxHash", type: "bytes32" },
      { name: "amountWei", type: "uint256" },
      { name: "tokenSymbol", type: "string" },
    ],
    name: "recordBurn",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "xrplTxHash", type: "bytes32" }],
    name: "isRecorded",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** XRPL EVM testnet chain id (Build In The Shade). */
export const XRPL_EVM_TESTNET_CHAIN_ID = 1440002;
/** XRPL EVM mainnet chain id. */
export const XRPL_EVM_MAINNET_CHAIN_ID = 1440001;

const XRPL_EVM_TESTNET_RPC = "https://xrplevm-testnet.buildintheshade.com";
const XRPL_EVM_MAINNET_RPC = "https://rpc.xrplevm.org";

function xrplHashToBytes32(xrplHash: string): `0x${string}` {
  const hex = xrplHash.startsWith("0x") ? xrplHash.slice(2) : xrplHash;
  return (`0x${hex.padStart(64, "0").slice(-64)}`) as `0x${string}`;
}

export type RecordBurnOnEVMResult = { success: true; txHash: string } | { success: false; error: string };

/**
 * Record a burn (XRPL L1 tx hash) on the BurnRegistry contract on XRPL EVM.
 * Requires window.ethereum (e.g. MetaMask) and user to be on XRPL EVM (or will prompt to switch).
 * User pays gas. Returns { success, txHash } or { success: false, error }.
 */
export async function recordBurnOnEVM(
  xrplBurnTxHash: string,
  amountWei: bigint,
  tokenSymbol: string,
  options?: {
    contractAddress?: string;
    chainId?: number;
  }
): Promise<RecordBurnOnEVMResult> {
  if (typeof window === "undefined" || !(window as unknown as { ethereum?: unknown }).ethereum) {
    return { success: false, error: "No EVM wallet (e.g. MetaMask) found." };
  }

  const contractAddress =
    options?.contractAddress ??
    (process.env.NEXT_PUBLIC_BURN_REGISTRY_ADDRESS as string | undefined);
  if (!contractAddress) {
    return { success: false, error: "Burn registry contract address not configured." };
  }

  const chainId =
    options?.chainId ??
    (process.env.NEXT_PUBLIC_XRPL_EVM_CHAIN_ID
      ? parseInt(process.env.NEXT_PUBLIC_XRPL_EVM_CHAIN_ID, 10)
      : XRPL_EVM_TESTNET_CHAIN_ID);

  try {
    const { createWalletClient, custom, writeContract } = await import("viem");

    const transport = custom((window as unknown as { ethereum: unknown }).ethereum);
    const client = createWalletClient({
      transport,
    });

    const [account] = await client.getAddresses();
    if (!account) {
      return { success: false, error: "Connect your EVM wallet first." };
    }

    const txHashBytes32 = xrplHashToBytes32(xrplBurnTxHash);
    const chain = {
      id: chainId,
      name: chainId === XRPL_EVM_MAINNET_CHAIN_ID ? "XRPL EVM Mainnet" : "XRPL EVM Testnet",
      nativeCurrency: { name: "XRP", symbol: "XRP", decimals: 18 },
      rpcUrls: {
        default: {
          http: [chainId === XRPL_EVM_MAINNET_CHAIN_ID ? XRPL_EVM_MAINNET_RPC : XRPL_EVM_TESTNET_RPC],
        },
      },
    };

    const hash = await client.writeContract({
      address: contractAddress as `0x${string}`,
      abi: BURN_REGISTRY_ABI,
      functionName: "recordBurn",
      args: [txHashBytes32, amountWei, tokenSymbol],
      account,
      chain,
    });

    return { success: true, txHash: hash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/** Format token amount to wei (e.g. 6 decimals → amount * 1e6). */
export function tokenAmountToWei(amount: number, decimals = 6): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}
