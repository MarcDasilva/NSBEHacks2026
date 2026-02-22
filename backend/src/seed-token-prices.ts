/**
 * Seed script to generate fake token_prices data for GGK
 * Uses a random walk algorithm starting from a base price
 *
 * Usage: npx ts-node src/seed-token-prices.ts
 */

import { getSupabase } from "./services/supabase";
import dotenv from "dotenv";

dotenv.config();

const TOKEN_NAME = "GGK";
const BASE_PRICE = 0.008333333333333333;
const NUM_RECORDS = 100; // Number of price records to generate
const VOLATILITY = 0.05; // 5% max change per step
const TIME_INTERVAL_SECONDS = 10; // Time between each price point

async function seedTokenPrices() {
  const supabase = getSupabase();

  console.log(`Generating ${NUM_RECORDS} price records for ${TOKEN_NAME}...`);

  const records: Array<{
    token_name: string;
    price: number;
    price_time: string;
  }> = [];

  let currentPrice = BASE_PRICE;
  const now = new Date();

  for (let i = NUM_RECORDS - 1; i >= 0; i--) {
    // Calculate timestamp going backwards from now
    const priceTime = new Date(now.getTime() - i * TIME_INTERVAL_SECONDS * 1000);

    // Random walk: change by -VOLATILITY to +VOLATILITY percent
    const changePercent = (Math.random() - 0.5) * 2 * VOLATILITY;
    currentPrice = currentPrice * (1 + changePercent);

    // Keep price within reasonable bounds (0.005 to 0.02)
    currentPrice = Math.max(0.005, Math.min(0.02, currentPrice));

    records.push({
      token_name: TOKEN_NAME,
      price: currentPrice,
      price_time: priceTime.toISOString(),
    });
  }

  // Insert all records
  const { data, error } = await supabase
    .from("token_prices")
    .insert(records)
    .select();

  if (error) {
    console.error("Error inserting records:", error);
    process.exit(1);
  }

  console.log(`Successfully inserted ${data?.length || 0} records`);
  console.log(`Price range: ${Math.min(...records.map(r => r.price)).toFixed(6)} - ${Math.max(...records.map(r => r.price)).toFixed(6)}`);
  console.log(`Final price: ${records[records.length - 1].price.toFixed(6)}`);

  // Show sample of data
  console.log("\nSample records:");
  records.slice(-5).forEach(r => {
    console.log(`  ${r.price_time}: ${r.price.toFixed(6)} XRP`);
  });
}

seedTokenPrices().catch(console.error);
