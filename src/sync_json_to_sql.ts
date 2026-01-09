import { AppDataSource } from "./data-source";
import { User } from "./entities/User";
import { Department } from "./entities/Department";
import { Category } from "./entities/Category";
import { EquipmentItem } from "./entities/EquipmentItem";
import { BorrowRequest } from "./entities/BorrowRequest";
import { RegistrationRequest } from "./entities/RegistrationRequest";
import { DeviceToken } from "./entities/DeviceToken";
import { readAll } from "./utils/store";
import { BorrowHistory } from "./entities/BorrowHistory";
import { promises as fs } from "fs";
import path from "path";

async function writeSuccessFlag(dataDir: string, flagFile: string) {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(flagFile, "success", "utf8");
    console.log("[JSON→SQL] Migration success flag written.");
    console.log("success");
}

export async function migrateJsonToSqlIfNeeded(): Promise<void> {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    const flagFile = path.join(dataDir, "json_to_sql_migration_success.flag");

    try {
        await fs.access(flagFile);
        console.log("[JSON→SQL] Success flag detected, skip migration.");
        return;
    } catch {
    }

    const userRepo = AppDataSource.getRepository(User);
    const existingUsers = await userRepo.count();

    if (existingUsers > 0) {
        console.log("[JSON→SQL] Skip migration: database already has users.");
        await writeSuccessFlag(dataDir, flagFile);
        return;
    }

    const depts = await readAll<Department>("departments");
    const cats = await readAll<Category>("categories");
    const users = await readAll<User>("users");
    const regs = await readAll<RegistrationRequest>("registration_requests");
    const reqs = await readAll<BorrowRequest>("borrow_requests");
    const tokens = await readAll<DeviceToken>("device_tokens");
    const items = await readAll<any>("items");

    const totalRecords =
        depts.length +
        cats.length +
        users.length +
        regs.length +
        reqs.length +
        tokens.length +
        items.length;

    if (totalRecords === 0) {
        console.log("[JSON→SQL] No legacy JSON data found, skip migration.");
        await writeSuccessFlag(dataDir, flagFile);
        return;
    }

    console.log("[JSON→SQL] Starting migration from JSON files to MySQL...");

    const deptRepo = AppDataSource.getRepository(Department);
    for (const d of depts) {
        await deptRepo.save(d);
    }
    console.log(`[JSON→SQL] Migrated ${depts.length} departments.`);

    const catRepo = AppDataSource.getRepository(Category);
    for (const c of cats) {
        await catRepo.save(c);
    }
    console.log(`[JSON→SQL] Migrated ${cats.length} categories.`);

    for (const u of users) {
        await userRepo.save(u);
    }
    console.log(`[JSON→SQL] Migrated ${users.length} users.`);

    const regRepo = AppDataSource.getRepository(RegistrationRequest);
    for (const r of regs) {
        await regRepo.save(r);
    }
    console.log(`[JSON→SQL] Migrated ${regs.length} registration requests.`);

    const reqRepo = AppDataSource.getRepository(BorrowRequest);
    for (const raw of reqs as any[]) {
        // 兼容旧数据：有的版本只有 applicant，没有 borrower
        const entity = reqRepo.create();
        Object.assign(entity, raw);

        if (!entity.applicant && (raw as any).borrower) {
            entity.applicant = (raw as any).borrower;
        }
        if (!entity.borrower && entity.applicant) {
            entity.borrower = entity.applicant;
        }
        if (!entity.borrower) {
            entity.borrower = { name: "", phone: "" };
        }
        if (!entity.applicant) {
            entity.applicant = { name: "", phone: "" };
        }

        await reqRepo.save(entity);
    }
    console.log(`[JSON→SQL] Migrated ${reqs.length} borrow requests.`);

    const tokenRepo = AppDataSource.getRepository(DeviceToken);
    for (const t of tokens) {
        await tokenRepo.save(t);
    }
    console.log(`[JSON→SQL] Migrated ${tokens.length} device tokens.`);

    const itemRepo = AppDataSource.getRepository(EquipmentItem);
    const historyRepo = AppDataSource.getRepository(BorrowHistory);

    for (const raw of items) {
        const { borrowHistory, ...itemData } = raw as any;
        const item = itemRepo.create(itemData as Partial<EquipmentItem>);
        await itemRepo.save(item);

        if (Array.isArray(borrowHistory)) {
            for (const h of borrowHistory) {
                const history = historyRepo.create({
                    ...h,
                    itemId: item.id,
                    item: item,
                });
                await historyRepo.save(history);
            }
        }
    }
    console.log(`[JSON→SQL] Migrated ${items.length} items with history.`);
    console.log("[JSON→SQL] Migration complete.");

    await writeSuccessFlag(dataDir, flagFile);
}

if (require.main === module) {
    (async () => {
        try {
            await AppDataSource.initialize();
            console.log("Database connected.");
            await migrateJsonToSqlIfNeeded();
            process.exit(0);
        } catch (error) {
            console.error("Migration failed:", error);
            process.exit(1);
        }
    })();
}
