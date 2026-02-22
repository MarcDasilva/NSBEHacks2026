import { Sql } from "postgres";

export const count_api_keysQuery = `-- name: count_api_keys :one
SELECT COUNT(*) AS count FROM proxy_api_keys`;

export interface count_api_keysRow {
    count: string;
}

export async function count_api_keys(sql: Sql): Promise<count_api_keysRow | null> {
    const rows = await sql.unsafe(count_api_keysQuery, []).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const get_real_keyQuery = `-- name: get_real_key :one
SELECT real_key, token_type, user_id FROM proxy_api_keys WHERE proxy_key = $1`;

export interface get_real_keyArgs {
    proxyKey: string;
}

export interface get_real_keyRow {
    realKey: string;
    tokenType: string;
    userId: string;
}

export async function get_real_key(sql: Sql, args: get_real_keyArgs): Promise<get_real_keyRow | null> {
    const rows = await sql.unsafe(get_real_keyQuery, [args.proxyKey]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        realKey: row[0],
        tokenType: row[1],
        userId: row[2]
    };
}

export const deduct_user_tokensQuery = `-- name: deduct_user_tokens :exec
UPDATE user_api_tokens
SET token_amount = token_amount - $1, updated_at = NOW()
WHERE user_id = $2 AND token_name = $3 AND token_amount >= $1`;

export interface deduct_user_tokensArgs {
    amount: number;
    userId: string;
    tokenName: string;
}

export async function deduct_user_tokens(sql: Sql, args: deduct_user_tokensArgs): Promise<void> {
    await sql.unsafe(deduct_user_tokensQuery, [args.amount, args.userId, args.tokenName]);
}

export const get_user_token_balanceQuery = `-- name: get_user_token_balance :one
SELECT token_amount FROM user_api_tokens WHERE user_id = $1 AND token_name = $2`;

export interface get_user_token_balanceArgs {
    userId: string;
    tokenName: string;
}

export interface get_user_token_balanceRow {
    tokenAmount: number;
}

export async function get_user_token_balance(sql: Sql, args: get_user_token_balanceArgs): Promise<get_user_token_balanceRow | null> {
    const rows = await sql.unsafe(get_user_token_balanceQuery, [args.userId, args.tokenName]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        tokenAmount: Number(row[0])
    };
}


