/**
 * 一次性修复脚本：把数据库里残留的明文密码转换为 scrypt 哈希。
 *
 * 背景：早期版本在生产环境默认允许明文存储密码，且 JSON→SQL 迁移未做哈希，
 * 导致 user.password 与 registration_request.passwordHash 中可能存在明文。
 * 登录逻辑虽然会在用户下次登录时自动升级，但从未登录过的账号会一直是明文。
 *
 * 用法（在 server 目录下）：
 *   node scripts/hash_plaintext_passwords.js          # 演练，只报告不修改
 *   node scripts/hash_plaintext_passwords.js --apply  # 实际写入
 *
 * 注意：脚本无法还原原始密码，它把「当前存着的那串明文」作为密码做哈希，
 * 因此用户原有的密码在转换后仍然可用。转换完成后建议要求相关账号改密。
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');

/** 与 src/services/authService.ts 中的 isHashedPassword 保持一致 */
function isHashedPassword(value) {
    return typeof value === 'string' && value.startsWith('scrypt$');
}

/** 与 src/services/authService.ts 中的 hashPassword 保持一致 */
function hashPassword(plain) {
    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(plain, salt, 32);
    return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function requireEnv(name) {
    const value = process.env[name];
    if (!value || !String(value).trim()) {
        console.error(`[配置错误] 缺少环境变量 ${name}，请检查 server/.env`);
        process.exit(1);
    }
    return value;
}

async function fixTable(connection, table, idColumn, passwordColumn) {
    const [rows] = await connection.execute(
        `SELECT ${idColumn} AS id, ${passwordColumn} AS secret FROM ${table}`
    );

    const plaintextRows = rows.filter((row) => row.secret && !isHashedPassword(row.secret));

    console.log(`\n[${table}] 共 ${rows.length} 行，其中 ${plaintextRows.length} 行是明文。`);

    if (plaintextRows.length === 0) return 0;

    for (const row of plaintextRows) {
        if (APPLY) {
            await connection.execute(
                `UPDATE ${table} SET ${passwordColumn} = ? WHERE ${idColumn} = ?`,
                [hashPassword(row.secret), row.id]
            );
            console.log(`  已哈希: ${row.id}`);
        } else {
            console.log(`  待哈希: ${row.id}`);
        }
    }

    return plaintextRows.length;
}

async function main() {
    const connection = await mysql.createConnection({
        host: requireEnv('MYSQL_HOST'),
        port: Number(process.env.MYSQL_PORT) || 3306,
        user: requireEnv('MYSQL_USER'),
        password: requireEnv('MYSQL_PASSWORD'),
        database: requireEnv('MYSQL_DATABASE'),
    });

    console.log(APPLY ? '模式：实际写入 (--apply)' : '模式：演练（不会修改数据，加 --apply 才写入）');

    let total = 0;
    total += await fixTable(connection, 'user', 'id', 'password');
    total += await fixTable(connection, 'registration_request', 'id', 'passwordHash');

    console.log(
        `\n合计 ${total} 条明文记录${APPLY ? '已完成哈希。' : '待处理，加 --apply 执行。'}`
    );

    await connection.end();
}

main().catch((err) => {
    console.error('执行失败:', err);
    process.exit(1);
});
