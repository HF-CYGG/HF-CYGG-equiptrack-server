import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "./entities/User";
import { Department } from "./entities/Department";
import { Category } from "./entities/Category";
import { EquipmentItem } from "./entities/EquipmentItem";
import { BorrowHistory } from "./entities/BorrowHistory";
import { BorrowRequest } from "./entities/BorrowRequest";
import { RegistrationRequest } from "./entities/RegistrationRequest";
import { DeviceToken } from "./entities/DeviceToken";

const isProduction = (process.env.NODE_ENV || "development") === "production";

/**
 * 数据库凭据一律来自环境变量。
 * 源码中不再保留任何真实账号密码：生产环境缺配置即启动失败，
 * 避免服务在配置丢失时静默连上一个写死在源码里的账号。
 */
function requireDbEnv(name: string, devFallback: string): string {
    const value = process.env[name];
    if (value && value.trim()) return value;

    // 生产环境缺配置一律拒绝启动；开发/测试环境回退到占位值并告警
    if (isProduction) {
        console.error(`[配置错误] 生产环境必须设置数据库环境变量 ${name}，服务拒绝启动。`);
        process.exit(1);
    }
    console.warn(`[配置告警] 未设置 ${name}，当前使用开发占位值。请勿在生产环境依赖该回退。`);
    return devFallback;
}

const shouldSynchronize =
    process.env.TYPEORM_SYNCHRONIZE === "true" ||
    process.env.DB_SYNCHRONIZE === "true";

if (isProduction && shouldSynchronize) {
    console.error("[配置错误] 生产环境禁止开启 TYPEORM_SYNCHRONIZE/DB_SYNCHRONIZE，自动 DDL 可能删除线上数据，服务拒绝启动。");
    process.exit(1);
}

export const AppDataSource = new DataSource({
    type: "mysql",
    host: requireDbEnv("MYSQL_HOST", "localhost"),
    port: Number(process.env.MYSQL_PORT) || 3306,
    username: requireDbEnv("MYSQL_USER", "equiptrack_dev"),
    password: requireDbEnv("MYSQL_PASSWORD", ""),
    database: requireDbEnv("MYSQL_DATABASE", "EquipTrack"),
    synchronize: shouldSynchronize,
    logging: false,
    entities: [
        User,
        Department,
        Category,
        EquipmentItem,
        BorrowHistory,
        BorrowRequest,
        RegistrationRequest,
        DeviceToken
    ],
    migrations: [],
    subscribers: [],
});
