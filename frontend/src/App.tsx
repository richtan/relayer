import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { WagmiProvider, useBlockNumber } from "wagmi";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "./config/wagmi";
import Layout from "./components/layout/Layout";
import ClientPortal from "./pages/ClientPortal";
import WorkerMarketplace from "./pages/WorkerMarketplace";
import TaskDetailPage from "./pages/TaskDetailPage";
import MyTasks from "./pages/MyTasks";
import AgentDashboard from "./pages/AgentDashboard";
import MyJobs from "./pages/MyJobs";

const queryClient = new QueryClient();

/** Invalidate balance queries on every new block so ConnectButton stays fresh */
function BalanceRefresher() {
  const qc = useQueryClient();
  const { data: blockNumber } = useBlockNumber({ watch: true });
  useEffect(() => {
    if (blockNumber) qc.invalidateQueries({ queryKey: ["balance"] });
  }, [blockNumber, qc]);
  return null;
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: "#1657f5", borderRadius: "small" })}>
          <BalanceRefresher />
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<ClientPortal />} />
                <Route path="/jobs" element={<MyJobs />} />
                <Route path="/work" element={<WorkerMarketplace />} />
                <Route path="/work/:taskId" element={<TaskDetailPage />} />
                <Route path="/my-tasks" element={<MyTasks />} />
                <Route path="/dashboard" element={<AgentDashboard />} />
              </Route>
            </Routes>
          </BrowserRouter>
          <Analytics />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
