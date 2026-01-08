import { AppDataSource } from "../data-source";
import { EquipmentItem } from "../entities/EquipmentItem";
import { BorrowHistory } from "../entities/BorrowHistory";
import { BorrowRequest } from "../entities/BorrowRequest";
import { Department } from "../entities/Department";
import { generateId } from "../utils/store";
import type { BorrowerInfo, UserRole } from "../models/types";
import fs from "fs";
import path from "path";
import { In } from "typeorm";

export async function listItems(): Promise<EquipmentItem[]> {
  const itemRepo = AppDataSource.getRepository(EquipmentItem);
  const reqRepo = AppDataSource.getRepository(BorrowRequest);
  const deptRepo = AppDataSource.getRepository(Department);

  const items = await itemRepo.find({
    relations: ["borrowHistory"]
  });
  
  const pendingRequests = await reqRepo.find({
    where: { status: "pending" }
  });

  const departments = await deptRepo.find();
  
  // Calculate pending quantities map
  const pendingMap = new Map<string, number>();
  for (const req of pendingRequests) {
    const current = pendingMap.get(req.itemId) || 0;
    pendingMap.set(req.itemId, current + req.quantity);
  }
  
  // Update items with pending quantity and adjust available quantity
  // Note: We return modified instances, but don't save them to DB here (calculated fields)
  return items.map(item => {
    const pendingQty = pendingMap.get(item.id) || 0;
    
    // Resolve effective requiresApproval
    let effectiveRequiresApproval = item.requiresApproval;
    if (effectiveRequiresApproval === undefined || effectiveRequiresApproval === null) {
        const dept = departments.find(d => d.id === item.departmentId);
        effectiveRequiresApproval = dept?.requiresApproval ?? true;
    }

    // Clone or modify? Modifying the entity instance is fine as long as we don't save it back with these computed values 
    // if they are not columns. availableQuantity IS a column, but here we want "displayed available".
    // Actually, availableQuantity in DB should be the real available. 
    // The logic in original code:
    // availableQuantity = Math.max(0, item.availableQuantity - pendingQty)
    // This implies DB stores "physically available", but UI shows "available considering pending".
    
    return {
      ...item,
      requiresApproval: effectiveRequiresApproval,
      pendingApprovalQuantity: pendingQty,
      availableQuantity: Math.max(0, item.availableQuantity - pendingQty)
    } as EquipmentItem;
  });
}

export async function getItem(id: string): Promise<EquipmentItem> {
  const itemRepo = AppDataSource.getRepository(EquipmentItem);
  const item = await itemRepo.findOne({
    where: { id },
    relations: ["borrowHistory"]
  });
  
  if (!item) throw Object.assign(new Error("Item not found"), { status: 404 });
  
  // We might want to apply the same pending calculation logic here?
  // The original code called listItems() and found the item, so it DID apply logic.
  // So we should replicate that.
  
  const reqRepo = AppDataSource.getRepository(BorrowRequest);
  const pendingRequests = await reqRepo.find({ where: { status: "pending", itemId: id } });
  const pendingQty = pendingRequests.reduce((acc, req) => acc + req.quantity, 0);

  const deptRepo = AppDataSource.getRepository(Department);
  const dept = await deptRepo.findOneBy({ id: item.departmentId });
  
  let effectiveRequiresApproval = item.requiresApproval;
    if (effectiveRequiresApproval === undefined || effectiveRequiresApproval === null) {
        effectiveRequiresApproval = dept?.requiresApproval ?? true;
    }

  return {
      ...item,
      requiresApproval: effectiveRequiresApproval,
      pendingApprovalQuantity: pendingQty,
      availableQuantity: Math.max(0, item.availableQuantity - pendingQty)
  } as EquipmentItem;
}

export async function addItem(input: Omit<EquipmentItem, "id" | "borrowHistory">): Promise<EquipmentItem> {
  const itemRepo = AppDataSource.getRepository(EquipmentItem);
  const item = itemRepo.create({
      ...input,
      id: generateId("item"),
      borrowHistory: []
  });
  await itemRepo.save(item);
  return item;
}

export async function updateItem(id: string, input: Partial<EquipmentItem>): Promise<EquipmentItem> {
  const itemRepo = AppDataSource.getRepository(EquipmentItem);
  let item = await itemRepo.findOneBy({ id });
  if (!item) throw Object.assign(new Error("Item not found"), { status: 404 });
  
  // Merge input into item
  itemRepo.merge(item, input);
  
  await itemRepo.save(item);
  return item;
}

export async function deleteItem(id: string): Promise<{ message: string }> {
  const itemRepo = AppDataSource.getRepository(EquipmentItem);
  const item = await itemRepo.findOneBy({ id });
  if (!item) throw Object.assign(new Error("Item not found"), { status: 404 });
  
  // Delete associated image file if it exists
  const tryDeleteUploadFile = (p?: string) => {
    if (!p || !p.startsWith("/uploads/")) return;
    try {
      const relativePath = p.substring(1);
      const absolutePath = path.join(process.cwd(), relativePath);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch (_err) {
      return;
    }
  };

  tryDeleteUploadFile(item.image);
  tryDeleteUploadFile(item.imageFull);

  await itemRepo.remove(item);
  return { message: "Item deleted" };
}

export async function borrowItem(
  id: string,
  payload: { borrower: BorrowerInfo; operator?: BorrowerInfo; expectedReturnDate: string; photo?: string; quantity?: number }
): Promise<EquipmentItem> {
  return AppDataSource.transaction(async transactionalEntityManager => {
      const itemRepo = transactionalEntityManager.getRepository(EquipmentItem);
      const item = await itemRepo.findOne({ where: { id }, relations: ["borrowHistory"] });
      
      if (!item) throw Object.assign(new Error("Item not found"), { status: 404 });
      
      const quantity = payload.quantity && payload.quantity > 0 ? Math.floor(payload.quantity) : 1;
      
      // Check against RAW available quantity
      if (item.availableQuantity < quantity) {
        throw Object.assign(new Error("No available quantity"), { status: 400 });
      }

      // Create history entries
      for (let i = 0; i < quantity; i++) {
        const history = new BorrowHistory();
        history.id = generateId("hist");
        history.itemId = id;
        history.borrower = payload.borrower;
        history.operator = payload.operator;
        history.borrowDate = new Date().toISOString();
        history.expectedReturnDate = payload.expectedReturnDate;
        history.status = "借用中";
        history.photo = payload.photo;
        
        // Push to item relation (if using cascade)
        // Or save directly
        // item.borrowHistory.push(history); 
        // Better to save history explicitly if we didn't enable cascade insert on update
        // We enabled cascade: true in EquipmentItem entity.
        if (!item.borrowHistory) item.borrowHistory = [];
        item.borrowHistory.push(history);
      }
      
      item.availableQuantity -= quantity;
      
      await itemRepo.save(item);
      return item;
  });
}

export async function returnItem(
  itemId: string,
  historyEntryId: string,
  payload: { photo?: string; isForced?: boolean; adminName?: string }
): Promise<EquipmentItem> {
  return AppDataSource.transaction(async transactionalEntityManager => {
      const itemRepo = transactionalEntityManager.getRepository(EquipmentItem);
      const item = await itemRepo.findOne({ where: { id: itemId }, relations: ["borrowHistory"] });
      
      if (!item) throw Object.assign(new Error("Item not found"), { status: 404 });
      
      const entry = item.borrowHistory.find(h => h.id === historyEntryId);
      if (!entry) throw Object.assign(new Error("Borrow history not found"), { status: 404 });
      
      if (!(entry.status === "借用中" || entry.status === "逾期未归还")) {
        throw Object.assign(new Error("Invalid history status"), { status: 400 });
      }
      
      item.availableQuantity += 1;
      const now = new Date();
      entry.returnDate = now.toISOString();
      
      // Check if overdue based on actual time vs expected time
      const expectedDate = new Date(entry.expectedReturnDate);
      const isOverdue = now.getTime() > expectedDate.getTime();
      
      entry.status = isOverdue ? "逾期归还" : "已归还";
      
      if (payload.isForced && payload.adminName) entry.forcedReturnBy = payload.adminName;
      if (payload.photo) entry.returnPhoto = payload.photo;
      
      // Save item (cascades to history)
      await itemRepo.save(item);
      return item;
  });
}

export function filterItems(
  items: EquipmentItem[],
  opts: { userRole: UserRole; departmentId?: string; allAvailable?: boolean }
): EquipmentItem[] {
  let result = items;
  if (opts.allAvailable) {
    result = result.filter((i) => i.availableQuantity > 0);
    return result;
  }
  if (opts.departmentId) {
    result = result.filter((i) => i.departmentId === opts.departmentId);
  }
  
  // Allow all users to view all items if no departmentId is specified (Cross-department feature)
  return result;
}
