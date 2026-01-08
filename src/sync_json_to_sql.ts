import { AppDataSource } from "./data-source";
import { User } from "./entities/User";
import { Department } from "./entities/Department";
import { Category } from "./entities/Category";
import { EquipmentItem } from "./entities/EquipmentItem";
import { BorrowRequest } from "./entities/BorrowRequest";
import { RegistrationRequest } from "./entities/RegistrationRequest";
import { DeviceToken } from "./entities/DeviceToken";
import { readAll } from "./utils/store"; // Use existing utility to read JSON
import { BorrowHistory } from "./entities/BorrowHistory";

async function migrate() {
    try {
        await AppDataSource.initialize();
        console.log("Database connected.");

        // 1. Departments
        const depts = await readAll<Department>("departments");
        const deptRepo = AppDataSource.getRepository(Department);
        for (const d of depts) {
            await deptRepo.save(d);
        }
        console.log(`Migrated ${depts.length} departments.`);

        // 2. Categories
        const cats = await readAll<Category>("categories");
        const catRepo = AppDataSource.getRepository(Category);
        for (const c of cats) {
            await catRepo.save(c);
        }
        console.log(`Migrated ${cats.length} categories.`);

        // 3. Users
        const users = await readAll<User>("users");
        const userRepo = AppDataSource.getRepository(User);
        for (const u of users) {
            await userRepo.save(u);
        }
        console.log(`Migrated ${users.length} users.`);

        // 4. Registration Requests
        const regs = await readAll<RegistrationRequest>("registration_requests");
        const regRepo = AppDataSource.getRepository(RegistrationRequest);
        for (const r of regs) {
            await regRepo.save(r);
        }
        console.log(`Migrated ${regs.length} registration requests.`);

        // 5. Borrow Requests
        const reqs = await readAll<BorrowRequest>("borrow_requests");
        const reqRepo = AppDataSource.getRepository(BorrowRequest);
        for (const r of reqs) {
            await reqRepo.save(r);
        }
        console.log(`Migrated ${reqs.length} borrow requests.`);

        // 6. Device Tokens
        const tokens = await readAll<DeviceToken>("device_tokens");
        const tokenRepo = AppDataSource.getRepository(DeviceToken);
        for (const t of tokens) {
            await tokenRepo.save(t);
        }
        console.log(`Migrated ${tokens.length} device tokens.`);

        // 7. Items & History
        // Note: EquipmentItem entity has 'borrowHistory' relation.
        // In JSON: Item has 'borrowHistory' array.
        // We need to ensure we map it correctly.
        const items = await readAll<EquipmentItem>("items");
        const itemRepo = AppDataSource.getRepository(EquipmentItem);
        
        for (const i of items) {
            // Fix: ensure borrowHistory is mapped to entities if needed, 
            // but TypeORM should handle plain objects if structure matches.
            // However, BorrowHistory entity expects 'item' relation, 
            // but cascade insert from Item side usually handles 'OneToMany'.
            
            // We might need to manually set itemId in history entries if cascade doesn't pick it up automatically 
            // without the back-reference in object, but usually it works.
            
            // Let's try saving directly.
            await itemRepo.save(i);
        }
        console.log(`Migrated ${items.length} items.`);

        console.log("Migration complete.");
        process.exit(0);

    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

migrate();
