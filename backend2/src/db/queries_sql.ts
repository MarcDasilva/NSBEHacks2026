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
SELECT real_key FROM proxy_api_keys WHERE proxy_key = $1`;

export interface get_real_keyArgs {
    proxyKey: string;
}

export interface get_real_keyRow {
    realKey: string;
}

export async function get_real_key(sql: Sql, args: get_real_keyArgs): Promise<get_real_keyRow | null> {
    const rows = await sql.unsafe(get_real_keyQuery, [args.proxyKey]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        realKey: row[0]
    };
}

