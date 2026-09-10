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
  const deptRepo = AppDataSource.getRepository(Department);

  // 1. Fetch all items (without history, thanks to eager: false)
  const items = await itemRepo.find();
  
  // 2. Aggregate pending requests directly in DB for performance
  const pendingCounts = await AppDataSource.getRepository(BorrowRequest)
    .createQueryBuilder("req")
    .select("req.itemId", "itemId")
    .addSelect("SUM(req.quantity)", "total")
    .where("req.status = :status", { status: "pending" })
    .groupBy("req.itemId")
    .getRawMany(); 

  const pendingMap = new Map<string, number>();
  pendingCounts.forEach(p => pendingMap.set(p.itemId, Number(p.total)));

  // 3. Fetch departments for approval rules
  const departments = await deptRepo.find();
  const deptMap = new Map(departments.map(d => [d.id, d]));
  
  // 4. Merge data
  return items.map(item => {
    const pendingQty = pendingMap.get(item.id) || 0;
    
    // Resolve effective requiresApproval
    let effectiveRequiresApproval = item.requiresApproval;
    if (effectiveRequiresApproval === undefined || effectiveRequiresApproval === null) {
        const dept = deptMap.get(item.departmentId);
        effectiveRequiresApproval = dept?.requiresApproval ?? true;
    }
    
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
      // 新建物资时可用量必须等于总量，不接受请求体自带的 availableQuantity，
      // 否则可以凭空造出一件「可用量远大于总量」的物资
      availableQuantity: input.quantity,
      borrowHistory: []
  });
  await itemRepo.save(item);
  return item;
}

// 允许通过接口修改的物资字段。
// 不在此列的字段一律忽略：
//   id                      —— 主键，merge 进去会改写主键并产生孤儿行
//   departmentId            —— 部门归属，改它等于把资产划到别的部门，仅超管可改
//   availableQuantity       —— 可用量由借还流程维护，不接受直接篡改
//   pendingApprovalQuantity —— 由待审批申请实时算出
//   borrowHistory           —— 关联表，避免误更新
const ITEM_EDITABLE_FIELDS = [
  "name",
  "categoryId",
  "quantity",
  "description",
  "image",
  "imageFull",
  "photos",
  "requiresApproval",
] as const;

export async function updateItem(
  id: string,
  input: Partial<EquipmentItem>,
  opts?: { allowDepartmentChange?: boolean }
): Promise<EquipmentItem> {
  const itemRepo = AppDataSource.getRepository(EquipmentItem);
  let item = await itemRepo.findOneBy({ id });
  if (!item) throw Object.assign(new Error("Item not found"), { status: 404 });

  const updateData: Partial<EquipmentItem> = {};
  for (const field of ITEM_EDITABLE_FIELDS) {
    if (input[field] !== undefined) {
      (updateData as any)[field] = input[field];
    }
  }

  // 部门调拨是独立的管理动作，只有超级管理员可以执行
  if (opts?.allowDepartmentChange && input.departmentId !== undefined) {
    updateData.departmentId = input.departmentId;
  }

  // 总量变化时同步调整可用量，保持「已借出数 = 总量 - 可用量」成立
  if (updateData.quantity !== undefined && updateData.quantity !== item.quantity) {
    const delta = updateData.quantity - item.quantity;
    updateData.availableQuantity = Math.max(0, Math.min(updateData.quantity, item.availableQuantity + delta));
  }

  itemRepo.merge(item, updateData);

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
  payload: { borrower: BorrowerInfo; operator?: BorrowerInfo; expectedReturnDate: string; photo?: string; quantity?: number; remark?: string; note?: string }
): Promise<EquipmentItem> {
  return AppDataSource.transaction(async transactionalEntityManager => {
      const itemRepo = transactionalEntityManager.getRepository(EquipmentItem);
      const histRepo = transactionalEntityManager.getRepository(BorrowHistory);
      
      const item = await itemRepo.findOne({ where: { id } }); // Removed relations: ["borrowHistory"]
      
      if (!item) throw Object.assign(new Error("Item not found"), { status: 404 });
      
      const quantity = payload.quantity && payload.quantity > 0 ? Math.floor(payload.quantity) : 1;
      
      // Check against RAW available quantity
      if (item.availableQuantity < quantity) {
        throw Object.assign(new Error("No available quantity"), { status: 400 });
      }

      // Create history entries
      const histories: BorrowHistory[] = [];
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
        history.remark = payload.remark;
        history.note = payload.note;
        
        histories.push(history);
      }
      
      // Bulk save history
      await histRepo.save(histories);
      
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
      const histRepo = transactionalEntityManager.getRepository(BorrowHistory);
      
      const item = await itemRepo.findOne({ where: { id: itemId } }); // Removed relations: ["borrowHistory"]
      
      if (!item) throw Object.assign(new Error("Item not found"), { status: 404 });
      
      const entry = await histRepo.findOne({ where: { id: historyEntryId, itemId } });
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
      
      // Save both
      await histRepo.save(entry);
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
