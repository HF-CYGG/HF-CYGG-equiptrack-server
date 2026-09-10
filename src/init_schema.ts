import "reflect-metadata";
import { DataSource } from "typeorm";
import { connectionOptions } from "./data-source";

/**
 * 首次部署时创建表结构。
 *
 * 为什么需要单独一个脚本：
 * - 服务进程启动时禁止开启 TYPEORM_SYNCHRONIZE，自动 DDL 会在实体变动时
 *   直接改表甚至删列，不能挂在每次启动的路径上；
 * - 而 utils/schema_fix.ts 只负责给已有的表补列，不会建表。
 *
 * 于是把「建表」收敛成一个需要人工执行一次的动作：
 *   docker compose exec equiptrack-server npm run db:init
 *
 * 它对已存在的表是幂等的（TypeORM 只补齐缺失的表和列），
 * 但仍建议在已有数据的库上执行前先备份。
 */
async function main() {
  const dataSource = new DataSource({
    ...connectionOptions,
    synchronize: true,
    migrations: [],
    subscribers: [],
  });

  console.log(`正在连接数据库 ${connectionOptions.host}:${connectionOptions.port}/${connectionOptions.database} ...`);
  await dataSource.initialize();

  const tables = await dataSource.query("SHOW TABLES");
  console.log(`表结构同步完成，当前共 ${tables.length} 张表。`);

  await dataSource.destroy();
}

main().catch((err) => {
  console.error("表结构初始化失败：", err);
  process.exit(1);
});
