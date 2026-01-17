import { AppDataSource } from "../data-source";

/**
 * Checks and fixes database schema issues that are not handled by TypeORM synchronization
 * (or when synchronization is disabled).
 */
export async function ensureDatabaseSchema() {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    
    try {
        // Fix 1: Ensure RegistrationRequest has createdAt column
        const hasCreatedAt = await queryRunner.hasColumn("registration_request", "createdAt");
        if (!hasCreatedAt) {
            console.log("[SchemaFix] Adding missing column 'createdAt' to 'registration_request'...");
            await queryRunner.query("ALTER TABLE `registration_request` ADD COLUMN `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)");
            console.log("[SchemaFix] Column 'createdAt' added successfully.");
        }

        // Fix 2: Ensure BorrowHistory has operator column (simple-json mapped to text)
        // This supports the "Approver" display feature
        const hasOperator = await queryRunner.hasColumn("borrow_history", "operator");
        if (!hasOperator) {
            console.log("[SchemaFix] Adding missing column 'operator' to 'borrow_history'...");
            await queryRunner.query("ALTER TABLE `borrow_history` ADD COLUMN `operator` TEXT NULL");
            console.log("[SchemaFix] Column 'operator' added successfully.");
        }

        // Fix 3: Ensure BorrowRequest has reviewer column
        const hasReviewer = await queryRunner.hasColumn("borrow_request", "reviewer");
        if (!hasReviewer) {
            console.log("[SchemaFix] Adding missing column 'reviewer' to 'borrow_request'...");
            await queryRunner.query("ALTER TABLE `borrow_request` ADD COLUMN `reviewer` TEXT NULL");
            console.log("[SchemaFix] Column 'reviewer' added successfully.");
        }

        // Fix 4: Ensure BorrowRequest has reviewedAt column
        const hasReviewedAt = await queryRunner.hasColumn("borrow_request", "reviewedAt");
        if (!hasReviewedAt) {
            console.log("[SchemaFix] Adding missing column 'reviewedAt' to 'borrow_request'...");
            await queryRunner.query("ALTER TABLE `borrow_request` ADD COLUMN `reviewedAt` VARCHAR(255) NULL");
            console.log("[SchemaFix] Column 'reviewedAt' added successfully.");
        }
        
    } catch (error) {
        console.error("[SchemaFix] Error checking/fixing schema:", error);
    } finally {
        await queryRunner.release();
    }
}
