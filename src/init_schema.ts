import "reflect-metadata";
import { AppDataSource } from "./data-source";

/**
 * 表结构初始化。
 *
 * 这里刻意区分两种场景：
 *
 * 1. 服务启动时（createSchemaIfEmpty）——只有在库里一张表都没有的情况下才建表。
 *    这样全新部署可以开箱即用，而已经有数据的库永远不会被自动 DDL 碰到。
 *    这也是不能直接开 TYPEORM_SYNCHRONIZE 的原因：那个开关会在实体变动时
 *    去改甚至删已有表的列，挂在每次启动的路径上风险太大。
 *
 * 2. 手工执行（npm run db:init）——无条件同步一次，用于新增实体或字段后
 *    把表结构补齐。幂等，但在有数据的库上执行前应先备份。
 */

/** 统计当前库里的表数量 */
async function countTables(): Promise<number> {
  const rows = await AppDataSource.query("SHOW TABLES");
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * 空库时建表。返回是否实际执行了建表。
 * 要求 AppDataSource 已经 initialize。
 */
export async function createSchemaIfEmpty(): Promise<boolean> {
  const existing = await countTables();
  if (existing > 0) return false;

  console.log("[Schema] 检测到空数据库，正在创建表结构...");
  await AppDataSource.synchronize();
  console.log(`[Schema] 表结构创建完成，共 ${await countTables()} 张表。`);
  return true;
}

/** 手工执行入口：无条件同步表结构 */
async function main() {
  await AppDataSource.initialize();

  const before = await countTables();
  console.log(`同步前共 ${before} 张表，正在同步表结构...`);

  await AppDataSource.synchronize();

  console.log(`同步完成，当前共 ${await countTables()} 张表。`);
  await AppDataSource.destroy();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error("表结构初始化失败：", err);
    process.exit(1);
  });
}
