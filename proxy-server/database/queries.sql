-- name: count_api_keys :one
SELECT COUNT(*) AS count FROM proxy_api_keys;

-- name: get_real_key :one
SELECT real_key, token_type, user_id FROM proxy_api_keys WHERE proxy_key = $1;

-- name: deduct_user_tokens :exec
UPDATE user_api_tokens
SET token_amount = token_amount - $1, updated_at = NOW()
WHERE user_id = $2 AND token_name = $3 AND token_amount >= $1;

-- name: get_user_token_balance :one
SELECT token_amount FROM user_api_tokens WHERE user_id = $1 AND token_name = $2;
