-- Run this once in Supabase SQL Editor to populate ticker_news with real articles.
-- After running, data lives only in Supabase (not in repo).

-- Google / Gemini
INSERT INTO ticker_news (ticker_id, url, headline, source, time_ago, sort_order) VALUES
  ('google', 'https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/', 'Gemini 3.1 Pro: A smarter model for your most complex tasks', 'The Keyword', 'Feb 19, 2026', 0),
  ('google', 'https://www.gizchina.com/google-2/google-gemini-31-pro-arrives-a-major-leap-in-ai-reasoning', 'Google Gemini 3.1 Pro Arrives: A Major Leap in AI Reasoning', 'Gizchina', 'Feb 22, 2026', 1),
  ('google', 'https://djmag.com/news/google-launches-ai-music-generation-tool-gemini', 'Google launches AI music generation tool on Gemini', 'DJ Mag', 'Feb 20, 2026', 2);

-- OpenAI
INSERT INTO ticker_news (ticker_id, url, headline, source, time_ago, sort_order) VALUES
  ('openai', 'https://www.cnbc.com/2026/02/20/openai-resets-spend-expectations-targets-around-600-billion-by-2030.html', 'OpenAI resets spending expectations, tells investors compute target is around $600 billion by 2030', 'CNBC', 'Feb 20, 2026', 0),
  ('openai', 'https://www.thecoinrepublic.com/2026/02/21/openai-cuts-2030-compute-spend-to-600b/', 'OpenAI cuts 2030 compute spend to $600B', 'The Coin Republic', 'Feb 21, 2026', 1),
  ('openai', 'https://finance.yahoo.com/news/microsoft-ceo-satya-nadella-says-160512018.html', 'Microsoft CEO Satya Nadella says Bill Gates told him his big bet on OpenAI would be a flop', 'Yahoo Finance', 'Feb 21, 2026', 2);

-- Anthropic
INSERT INTO ticker_news (ticker_id, url, headline, source, time_ago, sort_order) VALUES
  ('anthropic', 'https://www.anthropic.com/news/claude-code-security', 'Making frontier cybersecurity capabilities available to defenders', 'Anthropic', 'Feb 20, 2026', 0),
  ('anthropic', 'https://www.bloomberg.com/news/articles/2026-02-20/cyber-stocks-slide-as-anthropic-unveils-claude-code-security', 'Cyber stocks slide as Anthropic unveils Claude Code Security', 'Bloomberg', 'Feb 20, 2026', 1),
  ('anthropic', 'https://ucstrategies.com/news/anthropic-shipped-claude-cowork-with-a-known-security-flaw-then-gave-it-to-millions-anyway/', 'Anthropic shipped Claude Cowork with a known security flaw — then gave it to millions anyway', 'UC Strategies', 'Feb 21, 2026', 2);

-- Generic (for all other tickers)
INSERT INTO ticker_news (ticker_id, url, headline, source, time_ago, sort_order) VALUES
  ('generic', 'https://www.reuters.com/technology', 'API providers see demand rise on soft data, tariff moves', 'Reuters', '2 hours ago', 0),
  ('generic', 'https://www.reuters.com/business', 'AI API pricing firms as investors weigh usage data', 'Reuters', '5 hours ago', 1),
  ('generic', 'https://www.bloomberg.com', 'Wall St set for higher open after API earnings beat', 'Bloomberg', 'yesterday', 2);
