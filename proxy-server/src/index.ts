import Elysia from "elysia";
import { db } from "./database";
import { count_api_keys, get_real_key, deduct_user_tokens, get_user_token_balance } from "./db/queries_sql";
import { fetch } from "bun";
import xrpl, { Wallet } from "xrpl";
import {
    recordDeposit,
    reportUsage,
    getPaymentStatus,
    refundUnused,
    getSellerPayments,
    getBuyerPayments,
} from "./payments";

const XRPL_URL = process.env.XRPL_URL || "wss://s.altnet.rippletest.net:51233";
const ISSUER_SECRET = process.env.ISSUER_SECRET || "";

const xrplClient = new xrpl.Client(XRPL_URL);
let xrplConnected = false;

async function ensureXrplConnected() {
    if (!xrplConnected) {
        await xrplClient.connect();
        xrplConnected = true;
    }
}

type ApiType = "openai" | "google";
type TokenType = "OAK" | "GGK" | "ATK";

const VALID_TOKEN_TYPES: TokenType[] = ["OAK", "GGK", "ATK"];

interface ApiKeyHandler {
    extract: (headers: Record<string, string>) => string | null;
    transform: (realKey: string) => Record<string, string>;
}

const apiKeyHandlers: Record<ApiType, ApiKeyHandler> = {
    openai: {
        extract: (headers) => {
            const auth = headers["authorization"] || headers["Authorization"];
            if (!auth?.startsWith("Bearer ")) return null;
            return auth.slice(7);
    },
        transform: (realKey) => ({
            Authorization: `Bearer ${realKey}`,
        }),
    },
    google: {
        extract: (headers) => {
            return headers["x-goog-api-key"] || null;
        },
        transform: (realKey) => ({
            "x-goog-api-key": realKey,
        }),
    },
};

const FORBIDDEN_HEADERS = [
    "host", "connection", "content-length", "accept-encoding", "accept-language", "origin", "referer", "sec-fetch-mode", "sec-fetch-site", "sec-fetch-dest", "sec-fetch-user", "upgrade-insecure-requests", "user-agent", "cookie", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform"
];

interface OpenAIUsage {
    input_tokens: number;
    input_tokens_details?: { cached_tokens: number };
    output_tokens: number;
    output_tokens_details?: { reasoning_tokens: number };
    total_tokens: number;
}

interface OpenAIResponse {
    usage?: OpenAIUsage;
    [key: string]: unknown;
}

function extractOpenAITokenUsage(response: OpenAIResponse): OpenAIUsage | null {
    if (response.usage && typeof response.usage.total_tokens === "number") {
        return {
            input_tokens: response.usage.input_tokens ?? 0,
            input_tokens_details: response.usage.input_tokens_details,
            output_tokens: response.usage.output_tokens ?? 0,
            output_tokens_details: response.usage.output_tokens_details,
            total_tokens: response.usage.total_tokens,
        };
    }
    return null;
}

function extractGeminiTokenUsage(response: any): number {
    return response.usageMetadata?.totalTokenCount ?? 0;
}

async function deductTokensForUser(db: any, userId: string, tokenType: string, tokensToDeduct: number) {
    const currentBalance = await get_user_token_balance(db, {
        userId,
        tokenName: tokenType
    });
    if (currentBalance && currentBalance.tokenAmount >= tokensToDeduct) {
        await deduct_user_tokens(db, {
            amount: tokensToDeduct,
            userId,
            tokenName: tokenType
        });
        console.log(`[PROXY] Deducted ${tokensToDeduct} tokens from user ${userId} (token type: ${tokenType}). Remaining: ${currentBalance.tokenAmount - tokensToDeduct}`);
    } else {
        console.warn(`[PROXY] Insufficient tokens for user ${userId}. Required: ${tokensToDeduct}, Available: ${currentBalance?.tokenAmount ?? 0}`);
    }
}

const app = new Elysia()
    .get("/", () => "Hello Elysia")
    .get("/proxy-keys/count", async () => {
        const result = await count_api_keys(db);
        return {
            count: Number(result?.count ?? 0)
        };
    })
    // Proxy route: forwards requests to a target API
    .all("/proxy", async ({ request, query, body, headers }) => {
        const target = query.target;
        const apiType = (query as Record<string, string>).api_type as ApiType | undefined;

        if (!target) {
            return { error: "Missing 'target' query parameter" };
        }
        if (!apiType) {
            return { error: "Missing 'api_type' query parameter" };
        }

        const handler = apiKeyHandlers[apiType];
        if (!handler) {
            return { error: `Unsupported api_type: ${apiType}` };
        }

        try {
            // Filter out forbidden/problematic headers
            let fetchHeaders: Record<string, string> = {};
            for (const [key, value] of Object.entries(headers)) {
                if (!FORBIDDEN_HEADERS.includes(key.toLowerCase())) {
                    fetchHeaders[key] = value as string;
                }
            }

            // Extract proxy key and convert to real key
            const proxyKey = handler.extract(fetchHeaders);
            if (!proxyKey) {
                return { error: "Could not extract API key from request" };
            }

            const result = await get_real_key(db, { proxyKey });
            if (!result) {
                return { error: "Invalid proxy key" };
            }

            // Remove the original API key header and apply the real key
            delete fetchHeaders["authorization"];
            delete fetchHeaders["Authorization"];
            delete fetchHeaders["x-goog-api-key"];
            const realKeyHeaders = handler.transform(result.realKey);
            Object.assign(fetchHeaders, realKeyHeaders);
            // Only attach body for relevant methods
            if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && body) {
                if (!fetchHeaders["content-type"]) {
                    fetchHeaders["content-type"] = "application/json";
                }
            }
            const fetchOptions: any = {
                method: request.method,
                headers: fetchHeaders,
            };
            if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && body) {
                fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
            }
            // Forward request
            const resp = await fetch(target, fetchOptions);
            // Forward response status, headers, and body
            const responseData = await resp.json() as OpenAIResponse;

            // Extract token usage for OpenAI API responses and deduct from user balance
            let tokenUsage: OpenAIUsage | null = null;
            if (apiType === "openai") {
                tokenUsage = extractOpenAITokenUsage(responseData);
                if (tokenUsage) {
                    console.log(`[PROXY] OpenAI token usage - Input: ${tokenUsage.input_tokens}, Output: ${tokenUsage.output_tokens}, Total: ${tokenUsage.total_tokens}`);
                    const tokensToDeduct = tokenUsage.total_tokens;
                    const { userId, tokenType } = result;
                    await deductTokensForUser(db, userId, tokenType, tokensToDeduct);
                }
            } else if (apiType === "google") {
                const googleTokenUsage = extractGeminiTokenUsage(responseData);
                console.log(`[PROXY] Gemini token usage - Total tokens: ${googleTokenUsage}`);
                const { userId, tokenType } = result;
                await deductTokensForUser(db, userId, tokenType, googleTokenUsage);
            }

            return responseData;
        } catch (err: any) {
            return { error: err.message || "Proxy error" };
        }
    })
    // Get token usage from an OpenAI response body
    .post("/proxy/extract-usage", async ({ body }) => {
        const response = body as OpenAIResponse;

        const usage = extractOpenAITokenUsage(response);
        if (!usage) {
            return { error: "No usage data found in response" };
        }

        return {
            success: true,
            usage: {
                input_tokens: usage.input_tokens,
                input_tokens_details: usage.input_tokens_details,
                output_tokens: usage.output_tokens,
                output_tokens_details: usage.output_tokens_details,
                total_tokens: usage.total_tokens,
            },
        };
    })
    .post("/tokens/issue", async ({ body }) => {
        const { address, amount, token_type } = body as { address: string; amount: string; token_type: TokenType };

        if (!address || !amount || !token_type) {
            return { error: "Missing 'address', 'amount', or 'token_type' in request body" };
        }

        if (!VALID_TOKEN_TYPES.includes(token_type)) {
            return { error: `Invalid token_type. Must be one of: ${VALID_TOKEN_TYPES.join(", ")}` };
        }

        if (!ISSUER_SECRET) {
            return { error: "ISSUER_SECRET not configured" };
        }

        try {
            await ensureXrplConnected();

            const issuerWallet = Wallet.fromSeed(ISSUER_SECRET);

            const payment: xrpl.Payment = {
                TransactionType: "Payment",
                Account: issuerWallet.address,
                Destination: address,
                Amount: {
                    currency: token_type,
                    value: amount,
                    issuer: issuerWallet.address,
                },
            };

            const tx = await xrplClient.submitAndWait(payment, { wallet: issuerWallet });

            return {
                success: true,
                hash: tx.result.hash,
                issuer: issuerWallet.address,
                destination: address,
                amount,
                token_type,
            };
        } catch (err: any) {
            return { error: err.message || "Failed to issue AIK tokens" };
        }
    })
    // ── Payments (Escrow) endpoints ───────────────────
    .post("/payments/deposit", async ({ body }) => {
        const { buyerWallet, sellerWallet, listingId, depositTxHash, depositAmountXrp, pricePerCallXrp, expiresInHours } =
            body as {
                buyerWallet: string;
                sellerWallet: string;
                listingId: string;
                depositTxHash: string;
                depositAmountXrp: number;
                pricePerCallXrp: number;
                expiresInHours?: number;
            };

        if (!buyerWallet || !sellerWallet || !listingId || !depositTxHash || depositAmountXrp === undefined || pricePerCallXrp === undefined) {
            return { error: "Missing required fields: buyerWallet, sellerWallet, listingId, depositTxHash, depositAmountXrp, pricePerCallXrp" };
        }

        try {
            const payment = await recordDeposit({ buyerWallet, sellerWallet, listingId, depositTxHash, depositAmountXrp, pricePerCallXrp, expiresInHours });
            return { success: true, payment };
        } catch (err: any) {
            return { error: err.message };
        }
    })
    .post("/payments/usage/report", async ({ body }) => {
        const { listingId, buyerWallet, callsReported, idempotencyKey, hmacSignature } =
            body as {
                listingId: string;
                buyerWallet: string;
                callsReported: number;
                idempotencyKey: string;
                hmacSignature: string;
            };

        if (!listingId || !buyerWallet || callsReported === undefined || !idempotencyKey || !hmacSignature) {
            return { error: "Missing required fields: listingId, buyerWallet, callsReported, idempotencyKey, hmacSignature" };
        }

        try {
            const usageLog = await reportUsage({ listingId, buyerWallet, callsReported, idempotencyKey, hmacSignature });
            return { success: true, usageLog };
        } catch (err: any) {
            return { error: err.message };
        }
    })
    .get("/payments/status/:listingId/:buyerWallet", async ({ params }) => {
        try {
            const result = await getPaymentStatus(params.listingId, params.buyerWallet);
            return { success: true, ...result };
        } catch (err: any) {
            return { error: err.message };
        }
    })
    .post("/payments/refund", async ({ body }) => {
        const { listingId, buyerWallet } = body as { listingId: string; buyerWallet: string };

        if (!listingId || !buyerWallet) {
            return { error: "Missing required fields: listingId, buyerWallet" };
        }

        try {
            const result = await refundUnused(listingId, buyerWallet);
            return { success: true, ...result };
        } catch (err: any) {
            return { error: err.message };
        }
    })
    .get("/payments/seller/:wallet", async ({ params }) => {
        try {
            const payments = await getSellerPayments(params.wallet);
            return { success: true, payments };
        } catch (err: any) {
            return { error: err.message };
        }
    })
    .get("/payments/buyer/:wallet", async ({ params }) => {
        try {
            const payments = await getBuyerPayments(params.wallet);
            return { success: true, payments };
        } catch (err: any) {
            return { error: err.message };
        }
    })
    .listen(3000);

console.log(
    `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`
);
