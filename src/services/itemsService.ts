import { readAll, writeAll, generateId } from "../utils/store";
import type { EquipmentItem, BorrowHistoryEntry, BorrowerInfo, BorrowStatus, UserRole } from "../models/types";
import fs from "fs";
import path from "path";

const COLLECTION = "items";

export async function listItems(): Promise<EquipmentItem[]> {
  return readAll<EquipmentItem>(COLLECTION);
}

export async function getItem(id: string): Promise<EquipmentItem> {
  const list = await listItems();
  const found = list.find((i) => i.id === id);
  if (!found) throw Object.assign(new Error("Item not found"), { status: 404 });
  return found;
}

export async function addItem(input: Omit<EquipmentItem, "id" | "borrowHistory">): Promise<EquipmentItem> {
  const list = await listItems();
  const item: EquipmentItem = { ...input, id: generateId("item"), borrowHistory: [] };
  list.push(item);
  await writeAll<EquipmentItem>(COLLECTION, list);
  return item;
}

export async function updateItem(id: string, input: Partial<EquipmentItem>): Promise<EquipmentItem> {
  const list = await listItems();
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) throw Object.assign(new Error("Item not found"), { status: 404 });
  const merged = { ...list[idx], ...input, id } as EquipmentItem;
  list[idx] = merged;
  await writeAll<EquipmentItem>(COLLECTION, list);
  return merged;
}

export async function deleteItem(id: string): Promise<{ message: string }> {
  const list = await listItems();
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
  payload: { borrower: BorrowerInfo; expectedReturnDate: string; photo?: string }
): Promise<EquipmentItem> {
  const list = await listItems();
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) throw Object.assign(new Error("Item not found"), { status: 404 });
  const item = list[idx];
  if (item.availableQuantity <= 0) {
    throw Object.assign(new Error("No available quantity"), { status: 400 });
  }
  const history: BorrowHistoryEntry = {
    id: generateId("hist"),
    itemId: id,
    borrower: payload.borrower,
    borrowDate: new Date().toISOString(),
    expectedReturnDate: payload.expectedReturnDate,
    status: "借用中",
    photo: payload.photo,
  };
  item.availableQuantity -= 1;
  item.borrowHistory.push(history);
  list[idx] = item;
  await writeAll<EquipmentItem>(COLLECTION, list);
  return item;
}

export async function returnItem(
  itemId: string,
  historyEntryId: string,
  payload: { photo?: string; isForced?: boolean; adminName?: string }
): Promise<EquipmentItem> {
  const list = await listItems();
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
  entry.returnDate = new Date().toISOString();
  entry.status = entry.status === "逾期未归还" ? (payload.isForced ? "逾期归还" : "逾期归还") : payload.isForced ? "已归还" : "已归还";
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
