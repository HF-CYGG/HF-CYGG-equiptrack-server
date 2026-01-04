import { readAll, writeAll, generateId } from "../utils/store";
import type { EquipmentItem, BorrowHistoryEntry, BorrowerInfo, BorrowStatus, UserRole, BorrowRequestEntry, Department } from "../models/types";
import fs from "fs";
import path from "path";

const COLLECTION = "items";
const BORROW_REQUESTS_COLLECTION = "borrow_requests";

export async function listItems(): Promise<EquipmentItem[]> {
  const items = await readAll<EquipmentItem>(COLLECTION);
  const borrowRequests = await readAll<BorrowRequestEntry>(BORROW_REQUESTS_COLLECTION);
  const departments = await readAll<Department>("departments");
  
  const pendingRequests = borrowRequests.filter(req => req.status === "pending");
  
  // Calculate pending quantities map
  const pendingMap = new Map<string, number>();
  for (const req of pendingRequests) {
    const current = pendingMap.get(req.itemId) || 0;
    pendingMap.set(req.itemId, current + req.quantity);
  }
  
  // Update items with pending quantity and adjust available quantity
  return items.map(item => {
    const pendingQty = pendingMap.get(item.id) || 0;
    
    // Resolve effective requiresApproval
    // If undefined, inherit from department, otherwise default to true
    let effectiveRequiresApproval = item.requiresApproval;
    if (effectiveRequiresApproval === undefined) {
        const dept = departments.find(d => d.id === item.departmentId);
        effectiveRequiresApproval = dept?.requiresApproval ?? true;
    }

    return {
      ...item,
      requiresApproval: effectiveRequiresApproval,
      pendingApprovalQuantity: pendingQty,
      availableQuantity: Math.max(0, item.availableQuantity - pendingQty)
    };
  });
}

export async function getItem(id: string): Promise<EquipmentItem> {
  const list = await listItems();
  const found = list.find((i) => i.id === id);
  if (!found) throw Object.assign(new Error("Item not found"), { status: 404 });
  return found;
}

export async function addItem(input: Omit<EquipmentItem, "id" | "borrowHistory">): Promise<EquipmentItem> {
  const list = await readAll<EquipmentItem>(COLLECTION);
  const item: EquipmentItem = { ...input, id: generateId("item"), borrowHistory: [] };
  list.push(item);
  await writeAll<EquipmentItem>(COLLECTION, list);
  return item;
}

export async function updateItem(id: string, input: Partial<EquipmentItem>): Promise<EquipmentItem> {
  const list = await readAll<EquipmentItem>(COLLECTION);
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) throw Object.assign(new Error("Item not found"), { status: 404 });
  const merged = { ...list[idx], ...input, id } as EquipmentItem;
  list[idx] = merged;
  await writeAll<EquipmentItem>(COLLECTION, list);
  return merged;
}

export async function deleteItem(id: string): Promise<{ message: string }> {
  const list = await readAll<EquipmentItem>(COLLECTION);
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) throw Object.assign(new Error("Item not found"), { status: 404 });
  
  const itemToDelete = list[idx];
  
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

  tryDeleteUploadFile(itemToDelete.image);
  tryDeleteUploadFile(itemToDelete.imageFull);

  const next = list.filter((i) => i.id !== id);
  await writeAll<EquipmentItem>(COLLECTION, next);
  return { message: "Item deleted" };
}

export async function borrowItem(
  id: string,
  payload: { borrower: BorrowerInfo; operator?: BorrowerInfo; expectedReturnDate: string; photo?: string; quantity?: number }
): Promise<EquipmentItem> {
  const list = await readAll<EquipmentItem>(COLLECTION);
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) throw Object.assign(new Error("Item not found"), { status: 404 });
  const item = list[idx];
  const quantity = payload.quantity && payload.quantity > 0 ? Math.floor(payload.quantity) : 1;
  
  // Check against RAW available quantity
  if (item.availableQuantity < quantity) {
    throw Object.assign(new Error("No available quantity"), { status: 400 });
  }
  for (let i = 0; i < quantity; i++) {
    const history: BorrowHistoryEntry = {
      id: generateId("hist"),
      itemId: id,
      borrower: payload.borrower,
      operator: payload.operator,
      borrowDate: new Date().toISOString(),
      expectedReturnDate: payload.expectedReturnDate,
      status: "借用中",
      photo: payload.photo,
    };
    item.borrowHistory.push(history);
  }
  item.availableQuantity -= quantity;
  list[idx] = item;
  await writeAll<EquipmentItem>(COLLECTION, list);
  return item;
}

export async function returnItem(
  itemId: string,
  historyEntryId: string,
  payload: { photo?: string; isForced?: boolean; adminName?: string }
): Promise<EquipmentItem> {
  const list = await readAll<EquipmentItem>(COLLECTION);
  const idx = list.findIndex((i) => i.id === itemId);
  if (idx === -1) throw Object.assign(new Error("Item not found"), { status: 404 });
  const item = list[idx];
  const hIdx = item.borrowHistory.findIndex((h) => h.id === historyEntryId);
  if (hIdx === -1) throw Object.assign(new Error("Borrow history not found"), { status: 404 });
  const entry = item.borrowHistory[hIdx];
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
  item.borrowHistory[hIdx] = entry;
  list[idx] = item;
  await writeAll<EquipmentItem>(COLLECTION, list);
  return item;
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
