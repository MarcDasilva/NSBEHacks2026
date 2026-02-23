# apiXchange

## Overview
DevPost: https://devpost.com/software/apixchange\n
apiXchange is a decentralized marketplace for API credits, built on top of the XRP Ledger (XRPL). The platform enables users to buy and sell unused API credits as fungible tokens, reducing waste and lowering costs for developers. The MVP currently supports OpenAI, Google, and Anthropic APIs, focusing on these providers due to hackathon time constraints.

## How XRPL is Used
XRPL serves as the backbone for tokenization and settlement. Sellers issue API-specific tokens on XRPL, representing usage rights for a particular API (e.g., OpenAI tokens). Buyers purchase these tokens using XRP. The tokens are transferred on-chain, and trustlines are established to allow users to hold and trade API tokens. All offers, purchases, and settlements are recorded on XRPL, ensuring transparency and decentralization.

## System Architecture
The platform consists of several core components:

- **XRPL Integration**: Handles token issuance, trustline management, offer creation, and settlement. Sellers mint API tokens, buyers acquire them with XRP, and all transactions are managed via XRPL smart contracts and APIs.
- **Proxy API Layer**: Buyers never receive the seller's real API key. Instead, they are issued a proxy API key. When a request is made, the proxy service authenticates the buyer, swaps the proxy key for the real API key, forwards the request to the provider, and deducts the correct number of tokens from the buyer's balance. This ensures security and accurate usage tracking. The proxy server supports per-API handlers, rate limiting, and usage analytics, and allows the desired API route and type to be passed as query parameters.
- **Backend Services**: Built with Node.js and TypeScript, the backend manages XRPL interactions, user authentication, offer aggregation, token balance tracking, and proxy routing. It exposes REST endpoints for the frontend and handles real-time updates. It also manages the lifecycle of listings, purchases, and API key encryption.
- **Frontend**: Developed with Next.js and React, the frontend provides a live marketplace interface. Users can browse offers, view real-time prices, manage their balances, and interact with the platform. The UI is designed for clarity and responsiveness, using Tailwind CSS for styling. The frontend shows live token prices using Supabase's real-time features, displays historical and live price graphs, and allows users to buy/sell tokens directly from the order book.
- **Database**: Supabase/PostgreSQL is used to store off-chain data such as user profiles, offer metadata, API key mappings, transaction logs, and usage history. This complements the on-chain data for efficient querying and analytics. The database also tracks proxy API keys, wallet connections, and per-user transactions.

## Technical Flow
1. **Listing Credits**: Sellers connect their XRPL wallet and issue API tokens representing their available credits. They create offers specifying price per token. The backend encrypts the API key, stores the listing, mints a token/NFT, and creates a sell offer on XRPL.
2. **Buying Credits**: Buyers connect their XRPL wallet, browse available offers, and purchase tokens using XRP. The frontend computes the best price and available liquidity from the XRPL order book. Tokens are transferred on-chain, and the purchase is recorded off-chain.
3. **Proxy Key Issuance**: After purchase, buyers receive a proxy API key mapped to their token balance. The proxy key is stored in the database and linked to the buyer's wallet.
4. **Making API Requests**: Buyers use the proxy key to make requests. The proxy backend authenticates the request, checks the buyer's token balance, swaps in the real API key, forwards the request, and deducts tokens based on usage. The proxy supports different handlers for each API type and extracts usage from the API response to deduct the correct number of tokens.
5. **Usage Tracking**: All usage is logged in the database and token balances are updated both on-chain (XRPL) and off-chain (backend DB for fast access). The proxy server enables features like rate limiting and usage analytics, enhancing the overall functionality and security of the platform.
6. **Order Book and Price Discovery**: The frontend displays the current price of API tokens in real time, calculated from the XRPL order book. Users can view a live graph of prices and historical data, and buy/sell tokens directly from the UI. Selling tokens creates an offer on the XRPL order book; buying tokens fills an existing offer, transferring tokens to the buyer and XRP to the seller.

## Proxy Server Details
- Allows users to use proxy API keys from our platform to make requests to the actual API providers without exposing the real API keys.
- Handles authentication, request forwarding, and token deduction based on usage.
- Minimizes the risk of misuse and allows for precise tracking of API usage against purchased tokens.
- Enables features like rate limiting and usage analytics.
- Swaps the proxy API key for the real API key on the backend when a request is made.
- Deducts tokens based on the usage of the API, and returns the result to the user.
- Supports different handlers for each type of API call, and the desired API route/type is passed as a query param.

## Frontend Details
- Shows the current price of API tokens in real time using Supabase's real-time feature.
- Price is calculated based on the current sell orders on the XRPL order book for that specific token.
- Users can view a live graph of prices and historical data, and buy/sell tokens directly from the UI.
- Selling tokens creates an offer on the XRPL order book; buying tokens fills an existing offer, transferring tokens to the buyer and XRP to the seller.
- Each XRPL token allows one token or credit to be consumed by the API.
- Users can manage wallets, view their proxy keys, and track their purchases and sales.

## Database Details
- Tracks users, wallets, proxy API keys, listings, purchases, and transaction logs.
- Stores encrypted API keys and links them to XRPL tokens and offers.
- Records all API usage, token deductions, and settlement events for analytics and auditing.

## Design Considerations
- **Security**: Real API keys are never exposed to buyers. All sensitive operations are handled server-side.
- **Transparency**: All token transactions and offers are visible on XRPL, providing a verifiable audit trail.
- **Scalability**: The proxy and backend are stateless where possible, enabling horizontal scaling. Real-time updates are pushed to the frontend for a responsive user experience.
- **Extensibility**: The architecture allows for easy addition of new API providers and token types in the future.

## Limitations and MVP Scope
- Only OpenAI, Google, and Anthropic APIs are supported in the MVP due to hackathon time constraints.
- Some legacy code and features (e.g., NFTs, unused modules) are not part of the current system and should be disregarded.

## Future Directions
- Support for additional API providers and token types.
- Secondary trading of API tokens between users.
- Microtransaction support for per-request payments.
- Enhanced analytics and reporting for buyers and sellers.

---

*Built at a hackathon to reduce API credit waste and lower costs for developers, especially those from underrepresented backgrounds. The platform leverages XRPL for decentralized settlement and transparent tokenization of API usage rights.*
