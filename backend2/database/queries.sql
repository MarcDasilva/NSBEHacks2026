-- name: count_api_keys :one
SELECT COUNT(*) AS count FROM proxy_api_keys;

-- name: get_real_key :one
SELECT real_key FROM proxy_api_keys WHERE proxy_key = $1;
