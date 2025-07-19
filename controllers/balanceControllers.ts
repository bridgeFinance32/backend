import express, { Request, Response, NextFunction } from "express";
import { User } from "../model/userModel";
import axios from "axios";
// Map your symbols to CoinGecko IDs
const symbolToIdMap: Record<string, string> = {
  btc: "bitcoin",
  eth: "ethereum",
  link: "chainlink",
  bnb: "binancecoin",
  usdt: "tether",
  usdc: "usd-coin",
};

// 🧠 Simple in-memory cache
let cachedPrices: Record<string, number> = {};
let lastFetchTime: number = 0;
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

const fetchPricesFromCoinGecko = async (
  coinIds: string[]
): Promise<Record<string, number>> => {
  const idsParam = coinIds.join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;

  console.log("Fetching CoinGecko prices with URL:", url);

  try {
    const response = await axios.get(url);
    const data = response.data;

    const prices: Record<string, number> = {};
    for (const id of coinIds) {
      if (!data[id] || typeof data[id].usd !== "number") {
        throw new Error(`Missing price data for coin: ${id}`);
      }
      prices[id] = data[id].usd;
    }

    cachedPrices = prices;
    lastFetchTime = Date.now();

    return prices;
  } catch (error: any) {
    console.error("CoinGecko fetch failed:", error.message || error);
    throw new Error("Failed to fetch prices from CoinGecko");
  }
};

export const accountController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const balances = user.balances;

    // Map symbols to CoinGecko IDs & filter out any unknown keys
    const coinIds = Object.keys(balances)
      .map((key) => symbolToIdMap[key.toLowerCase()])
      .filter(Boolean) as string[];

    if (coinIds.length === 0) {
      throw new Error("No valid coins found in user balances");
    }

    const now = Date.now();
    const prices =
      now - lastFetchTime < CACHE_DURATION
        ? cachedPrices
        : await fetchPricesFromCoinGecko(coinIds);

    let totalAvailableUSD = 0;
    let totalPendingUSD = 0;

    for (const [coin, { available, pending }] of Object.entries(balances)) {
      const cgId = symbolToIdMap[coin.toLowerCase()];
      if (!cgId) {
        throw new Error(`Unsupported coin symbol: ${coin}`);
      }

      const price = prices[cgId];
      if (price === undefined) {
        throw new Error(`Price not found for coin: ${coin}`);
      }

      totalAvailableUSD += available * price;
      totalPendingUSD += pending * price;
    }

    res.status(200).json({
      totalAvailableUSD: totalAvailableUSD.toFixed(2),
      totalPendingUSD: totalPendingUSD.toFixed(2),
    });
  } catch (err) {
    console.error("Error in accountController:", err);
    next(err);
  }
};

const sseClients = new Map<string, Response>();
