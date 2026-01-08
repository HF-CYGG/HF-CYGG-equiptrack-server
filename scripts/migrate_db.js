const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function readJson(name) {
    const p = path.join(__dirname, `../data/${name}.json`);
    try {
        const data = await fs.readFile(p, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

async function main() {
    const connection = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        multipleStatements: true
    });

    console.log('Connected to MySQL.');

    // 1. Create Tables
    const schema = `
    CREATE TABLE IF NOT EXISTS department (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parentId VARCHAR(255),
        requiresApproval BOOLEAN DEFAULT TRUE,
        \`order\` INT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS category (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        color VARCHAR(255) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact VARCHAR(255) NOT NULL,
        departmentId VARCHAR(255) NOT NULL,
        departmentName VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        status VARCHAR(50),
        password VARCHAR(255) NOT NULL,
        invitationCode VARCHAR(255),
        avatarUrl VARCHAR(255)
    );

    CREATE TABLE IF NOT EXISTS registration_request (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact VARCHAR(255) NOT NULL,
        departmentName VARCHAR(255) NOT NULL,
        invitationCode VARCHAR(255) NOT NULL,
        invitedByUserId VARCHAR(255),
        status VARCHAR(50) NOT NULL,
        passwordHash VARCHAR(255) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_token (
        token VARCHAR(255) PRIMARY KEY,
        userId VARCHAR(255) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        updatedAt VARCHAR(255) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equipment_item (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        categoryId VARCHAR(255) NOT NULL,
        departmentId VARCHAR(255) NOT NULL,
        totalQuantity INT NOT NULL,
        availableQuantity INT NOT NULL,
        pendingApprovalQuantity INT,
        image VARCHAR(255),
        imageFull VARCHAR(255),
        photos TEXT, -- Store as JSON array or simple array
        requiresApproval BOOLEAN
    );

    CREATE TABLE IF NOT EXISTS borrow_history (
        id VARCHAR(255) PRIMARY KEY,
        itemId VARCHAR(255) NOT NULL,
        borrower JSON NOT NULL,
        borrowDate VARCHAR(255) NOT NULL,
        expectedReturnDate VARCHAR(255) NOT NULL,
        returnDate VARCHAR(255),
        status VARCHAR(50) NOT NULL,
        photo VARCHAR(255),
        returnPhoto VARCHAR(255),
        forcedReturnBy VARCHAR(255),
        operator JSON,
        FOREIGN KEY (itemId) REFERENCES equipment_item(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS borrow_request (
        id VARCHAR(255) PRIMARY KEY,
        itemId VARCHAR(255) NOT NULL,
        itemDepartmentId VARCHAR(255) NOT NULL,
        itemName VARCHAR(255),
        itemImage VARCHAR(255),
        borrower JSON NOT NULL,
        applicant JSON NOT NULL,
        expectedReturnDate VARCHAR(255) NOT NULL,
        photo VARCHAR(255),
        quantity INT NOT NULL,
        status VARCHAR(50) NOT NULL,
        remark VARCHAR(255),
        note VARCHAR(255),
        createdAt VARCHAR(255) NOT NULL,
        reviewedAt VARCHAR(255),
        reviewer JSON,
        borrowDate VARCHAR(255)
    );
    `;

    await connection.query(schema);
    console.log('Tables created.');

    // 2. Migrate Data
    
    // Departments
    const departments = await readJson('departments');
    for (const d of departments) {
        await connection.execute(
            'INSERT IGNORE INTO department (id, name, parentId, requiresApproval, `order`) VALUES (?, ?, ?, ?, ?)',
            [d.id, d.name, d.parentId || null, d.requiresApproval !== undefined ? d.requiresApproval : true, d.order || 0]
        );
    }
    console.log(`Migrated ${departments.length} departments.`);

    // Categories
    const categories = await readJson('categories');
    for (const c of categories) {
        await connection.execute(
            'INSERT IGNORE INTO category (id, name, color) VALUES (?, ?, ?)',
            [c.id, c.name, c.color]
        );
    }
    console.log(`Migrated ${categories.length} categories.`);

    // Users
    const users = await readJson('users');
    for (const u of users) {
        await connection.execute(
            'INSERT IGNORE INTO user (id, name, contact, departmentId, departmentName, role, status, password, invitationCode, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [u.id, u.name, u.contact, u.departmentId, u.departmentName, u.role, u.status || null, u.password, u.invitationCode || null, u.avatarUrl || null]
        );
    }
    console.log(`Migrated ${users.length} users.`);

    // RegistrationRequests
    const regs = await readJson('registration_requests');
    for (const r of regs) {
        await connection.execute(
            'INSERT IGNORE INTO registration_request (id, name, contact, departmentName, invitationCode, invitedByUserId, status, passwordHash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [r.id, r.name, r.contact, r.departmentName, r.invitationCode, r.invitedByUserId || null, r.status, r.passwordHash || '']
        );
    }
    console.log(`Migrated ${regs.length} registration requests.`);

    // DeviceTokens
    const tokens = await readJson('device_tokens');
    for (const t of tokens) {
        await connection.execute(
            'INSERT IGNORE INTO device_token (token, userId, platform, updatedAt) VALUES (?, ?, ?, ?)',
            [t.token, t.userId, t.platform, t.updatedAt]
        );
    }
    console.log(`Migrated ${tokens.length} device tokens.`);

    // Items and History
    const items = await readJson('items');
    for (const i of items) {
        // Insert Item
        await connection.execute(
            'INSERT IGNORE INTO equipment_item (id, name, categoryId, departmentId, totalQuantity, availableQuantity, pendingApprovalQuantity, image, imageFull, photos, requiresApproval) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [i.id, i.name, i.categoryId, i.departmentId, i.totalQuantity, i.availableQuantity, i.pendingApprovalQuantity || 0, i.image || null, i.imageFull || null, i.photos ? JSON.stringify(i.photos) : null, i.requiresApproval !== undefined ? i.requiresApproval : null]
        );

        // Insert History
        if (i.borrowHistory && Array.isArray(i.borrowHistory)) {
            for (const h of i.borrowHistory) {
                await connection.execute(
                    'INSERT IGNORE INTO borrow_history (id, itemId, borrower, borrowDate, expectedReturnDate, returnDate, status, photo, returnPhoto, forcedReturnBy, operator) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [h.id, i.id, JSON.stringify(h.borrower), h.borrowDate, h.expectedReturnDate, h.returnDate || null, h.status, h.photo || null, h.returnPhoto || null, h.forcedReturnBy || null, h.operator ? JSON.stringify(h.operator) : null]
                );
            }
        }
    }
    console.log(`Migrated ${items.length} items.`);

    // BorrowRequests
    const reqs = await readJson('borrow_requests');
    for (const r of reqs) {
        await connection.execute(
            'INSERT IGNORE INTO borrow_request (id, itemId, itemDepartmentId, itemName, itemImage, borrower, applicant, expectedReturnDate, photo, quantity, status, remark, note, createdAt, reviewedAt, reviewer, borrowDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [r.id, r.itemId, r.itemDepartmentId, r.itemName || null, r.itemImage || null, JSON.stringify(r.borrower), JSON.stringify(r.applicant), r.expectedReturnDate, r.photo || null, r.quantity, r.status, r.remark || null, r.note || null, r.createdAt, r.reviewedAt || null, r.reviewer ? JSON.stringify(r.reviewer) : null, r.borrowDate || null]
        );
    }
    console.log(`Migrated ${reqs.length} borrow requests.`);

    console.log('Done.');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
