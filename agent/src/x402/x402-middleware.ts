import { config } from "../config.js";
import { type Express } from "express";
import { generateJwt } from "@coinbase/cdp-sdk/auth";

export async function applyX402(app: Express, agentAddress: string) {
  if (!config.x402Enabled) {
    return;
  }

  try {
    const { paymentMiddleware, x402ResourceServer } = await import("@x402/express");
    const { ExactEvmScheme } = await import("@x402/evm/exact/server");
    const { HTTPFacilitatorClient } = await import("@x402/core/server");

    const facilitatorUrl = "https://api.cdp.coinbase.com/platform/v2/x402";
    const facilitator = new HTTPFacilitatorClient({
      url: facilitatorUrl,
      createAuthHeaders: async () => {
        const apiKeyId = process.env.CDP_API_KEY_ID!;
        const apiKeySecret = process.env.CDP_API_KEY_SECRET!;
        const host = "api.cdp.coinbase.com";
        const base = "/platform/v2/x402";

        const jwt = (method: string, path: string) =>
          generateJwt({ apiKeyId, apiKeySecret, requestMethod: method, requestHost: host, requestPath: path });

        return {
          verify:    { Authorization: `Bearer ${await jwt("POST", `${base}/verify`)}` },
          settle:    { Authorization: `Bearer ${await jwt("POST", `${base}/settle`)}` },
          supported: { Authorization: `Bearer ${await jwt("GET",  `${base}/supported`)}` },
        };
      },
    });

    const server = new x402ResourceServer(facilitator)
      .register("eip155:8453", new ExactEvmScheme());

    const routes = {
      "POST /api/ai/analyze-image": {
        accepts: { scheme: "exact", payTo: agentAddress, price: "$0.05", network: "eip155:8453" as const },
        description: "AI image analysis",
      },
      "POST /api/ai/classify-text": {
        accepts: { scheme: "exact", payTo: agentAddress, price: "$0.03", network: "eip155:8453" as const },
        description: "AI text classification",
      },
      "POST /api/ai/verify-photo": {
        accepts: { scheme: "exact", payTo: agentAddress, price: "$0.04", network: "eip155:8453" as const },
        description: "AI photo verification",
      },
    };

    app.use(paymentMiddleware(routes, server));
    console.log("x402 payment middleware enabled");
  } catch (err) {
    console.warn("x402 middleware failed to initialize (continuing without it):", err);
  }
}
