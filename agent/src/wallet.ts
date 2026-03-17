import { createWalletClient, http, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";

export interface AgentWallet {
  address: Address;
  sendTransaction(tx: { to: Address; data?: `0x${string}`; value?: bigint }): Promise<Hash>;
}

export async function createAgentWallet(): Promise<AgentWallet> {
  if (config.walletMode === "anvil") {
    const account = privateKeyToAccount(
      (process.env.AGENT_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`
    );
    const client = createWalletClient({ account, chain: config.chain, transport: http(config.rpcUrl) });
    return {
      address: account.address,
      sendTransaction: async (tx) => client.sendTransaction({ ...tx, account, chain: config.chain }),
    };
  }

  const { CdpSmartWalletProvider } = await import("@coinbase/agentkit");
  const walletProvider = await CdpSmartWalletProvider.configureWithWallet({
    apiKeyId: process.env.CDP_API_KEY_ID!,
    apiKeySecret: process.env.CDP_API_KEY_SECRET!,
    walletSecret: process.env.CDP_WALLET_SECRET!,
    networkId: config.chain.id === 8453 ? "base-mainnet" : "base-sepolia",
    address: process.env.CDP_SMART_WALLET_ADDRESS as `0x${string}` | undefined,
    owner: process.env.CDP_OWNER_ACCOUNT_ADDRESS as `0x${string}` | undefined,
  });
  return {
    address: walletProvider.getAddress() as Address,
    sendTransaction: async (tx) => {
      const hash = await walletProvider.sendTransaction(tx);
      return hash as Hash;
    },
  };
}
