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

const shouldSynchronize =
    process.env.TYPEORM_SYNCHRONIZE === "true" ||
    process.env.DB_SYNCHRONIZE === "true";

export const AppDataSource = new DataSource({
    type: "mysql",
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT) || 3306,
    username: process.env.MYSQL_USER || "yyh163",
    password: process.env.MYSQL_PASSWORD || "yyh020414",
    database: process.env.MYSQL_DATABASE || "EquipTrack",
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
