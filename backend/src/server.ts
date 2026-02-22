import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import xrplRoutes from "./routes/xrpl";
import listingsRoutes from "./routes/listings";
import usersRoutes from "./routes/users";
import { getXRPLService } from "./services/xrpl";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/xrpl", xrplRoutes);
app.use("/api/listings", listingsRoutes);
app.use("/api/users", usersRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    xrplConnected: getXRPLService().isConnected(),
  });
});

// Start server
async function start() {
  try {
    // Pre-connect to XRPL so the first request isn't slow
    console.log("🔗 Connecting to XRPL...");
    await getXRPLService().connect();
    console.log("✅ XRPL connected\n");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`   Health:  http://localhost:${PORT}/api/health`);
      console.log(`\n📡 XRPL API endpoints:`);
      console.log(`   POST   /api/xrpl/wallet              — Create testnet wallet`);
      console.log(`   GET    /api/xrpl/wallet/:address      — Get balance & NFTs`);
      console.log(`   POST   /api/xrpl/mint                 — Mint an NFT`);
      console.log(`   POST   /api/xrpl/sell-offer           — Create sell offer`);
      console.log(`   POST   /api/xrpl/mint-and-sell        — Mint + sell in one call`);
      console.log(`   GET    /api/xrpl/offers/:nfTokenId    — Browse sell offers`);
      console.log(`   POST   /api/xrpl/buy                  — Accept sell offer`);
      console.log(`   GET    /api/xrpl/verify/:addr/:nftId  — Verify NFT ownership`);
      console.log(`\n📦 Listings API endpoints:`);
      console.log(`   POST   /api/listings                  — Create listing (key + mint + sell)`);
      console.log(`   GET    /api/listings                  — Browse all listings`);
      console.log(`   GET    /api/listings/:id              — Get single listing`);
      console.log(`   POST   /api/listings/purchase         — Record purchase`);
      console.log(`   GET    /api/listings/purchases/:wallet — Buyer's purchases`);
      console.log(`   POST   /api/listings/access           — Get API key (verify NFT first)`);
      console.log(`\n👤 Users API endpoints:`);
      console.log(`   GET    /api/users/wallet               — Get user's wallet address`);
      console.log(`   POST   /api/users/wallet               — Store/update wallet address`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  await getXRPLService().disconnect();
  process.exit(0);
});

start();
