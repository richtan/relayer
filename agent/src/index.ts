import 'dotenv/config';
import { config, NETWORK } from './config.js';
import { publicClient } from './client.js';
import { createAgentWallet } from './wallet.js';
import { setAgentWallet } from './actions/marketplace.js';
import { setRouteWallet } from './x402/routes.js';
import { costTracker } from './cost-tracker.js';
import { JobOrchestrator } from './orchestrator.js';
import { recoverState } from './recovery.js';
import { startScheduler } from './scheduler.js';
import { createApp, registerAllRoutes } from './x402/server.js';
import { mountMcpServer } from './mcp/server.js';
import { type OrchestratorRef } from './mcp/tools.js';
import { JOB_MARKETPLACE_ABI } from './abi.js';
import { formatEther } from 'viem';

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection (non-fatal):", err);
});

async function main() {
  console.log(`Starting TaskMaster agent on ${NETWORK}...`);

  if (!config.contractAddress) {
    throw new Error('CONTRACT_ADDRESS env var is required');
  }

  // Start HTTP server and MCP endpoint immediately so external clients
  // (like Cursor's MCP client) can connect while the agent initializes.
  const app = createApp();
  const orchestratorRef: OrchestratorRef = { current: null };
  mountMcpServer(app, orchestratorRef);

  const port = process.env.PORT || 3001;
  app.listen(port, () =>
    console.log(`Agent API on port ${port} (initializing...)`),
  );

  const wallet = await createAgentWallet();
  console.log(`Agent wallet: ${wallet.address}`);

  const contractAgent = await publicClient.readContract({
    address: config.contractAddress,
    abi: JOB_MARKETPLACE_ABI,
    functionName: 'agent',
  });
  if (
    (contractAgent as string).toLowerCase() !== wallet.address.toLowerCase()
  ) {
    throw new Error(
      `Wallet ${wallet.address} does not match contract agent ${contractAgent}. ` +
        `Check AGENT_ADDRESS used during deployment.`,
    );
  }

  const balance = await publicClient.getBalance({ address: wallet.address });
  console.log(`Agent balance: ${formatEther(balance)} ETH`);
  if (balance < 100000000000000n) {
    console.warn('WARNING: Agent balance is very low. Transactions may fail.');
  }

  if (NETWORK !== 'localhost' && config.deploymentBlock === 0n) {
    console.warn(
      'WARNING: DEPLOYMENT_BLOCK is 0 on non-localhost. State recovery will scan from genesis.',
    );
  }

  setAgentWallet(wallet);
  setRouteWallet(wallet);

  await costTracker.initialize();

  const orchestrator = new JobOrchestrator();
  orchestrator.setWallet(wallet);

  await orchestrator.initialize();

  try {
    await recoverState(orchestrator);
  } catch (err) {
    console.error('State recovery failed (continuing without it):', err);
  }

  orchestrator.startListening();

  // Wire up the orchestrator ref so MCP tools become fully functional
  orchestratorRef.current = orchestrator;

  // Register REST routes and SSE stream (these need the wallet + orchestrator)
  await registerAllRoutes(app, orchestrator, wallet.address);

  startScheduler(wallet, orchestrator);

  console.log('TaskMaster agent fully operational.');
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
