import { readAll, writeAll, generateId } from "../utils/store";
import type { Department, User, EquipmentItem } from "../models/types";

const COLLECTION = "departments";

export async function listDepartments(): Promise<Department[]> {
  const list = await readAll<Department>(COLLECTION);
  // Ensure requiresApproval is set to true by default if missing
  // Sort by order first, then by name
  return list.map(d => ({
    ...d,
    requiresApproval: d.requiresApproval ?? true,
    order: d.order ?? 0
  })).sort((a, b) => {
    const orderDiff = (a.order || 0) - (b.order || 0);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

export async function updateDepartmentStructure(updates: { id: string; parentId?: string; order: number }[]): Promise<Department[]> {
  const list = await listDepartments();
  let changed = false;

  for (const update of updates) {
    const idx = list.findIndex(d => d.id === update.id);
    if (idx !== -1) {
      if (list[idx].parentId !== update.parentId || list[idx].order !== update.order) {
        list[idx] = {
          ...list[idx],
          parentId: update.parentId,
          order: update.order
        };
        changed = true;
      }
    }
  }

  if (changed) {
    await writeAll<Department>(COLLECTION, list);
  }
  return list;
}

export async function addDepartment(input: { name: string; requiresApproval?: boolean; parentId?: string }): Promise<Department> {
  const list = await listDepartments();
  if (list.find((d) => d.name === input.name && d.parentId === input.parentId)) {
    throw Object.assign(new Error("该部门名称已存在。"), { status: 400 });
  }
  const dept: Department = { 
    id: generateId("dept"), 
    name: input.name,
    requiresApproval: input.requiresApproval !== undefined ? input.requiresApproval : true,
    parentId: input.parentId
  };
  list.push(dept);
  await writeAll<Department>(COLLECTION, list);
  return dept;
}

export async function updateDepartment(id: string, input: { name: string; requiresApproval?: boolean; parentId?: string }): Promise<Department> {
  const list = await listDepartments();
  const idx = list.findIndex((d) => d.id === id);
  if (idx === -1) throw Object.assign(new Error("Department not found"), { status: 404 });
  
  const oldDept = list[idx];
  list[idx] = {
    ...oldDept,
    name: input.name,
    requiresApproval: input.requiresApproval !== undefined ? input.requiresApproval : oldDept.requiresApproval,
    parentId: input.parentId !== undefined ? input.parentId : oldDept.parentId
  };
  
  await writeAll<Department>(COLLECTION, list);

  // Sync items: If approval status changed, reset item-level override to inherit from department
  if (input.requiresApproval !== undefined) {
    const items = await readAll<EquipmentItem>("items");
    let itemsChanged = false;
    const updatedItems = items.map(item => {
      if (item.departmentId === id && item.requiresApproval !== undefined) {
        // Create a new object without the requiresApproval property to let it inherit
        const { requiresApproval, ...rest } = item;
        itemsChanged = true;
        return rest as EquipmentItem;
      }
      return item;
    });

    if (itemsChanged) {
      await writeAll<EquipmentItem>("items", updatedItems);
    }
  }

  // 同步更新用户的 departmentName
  if (input.name !== oldDept.name) {
    const users = await readAll<User>("users");
    const updated = users.map((u) => (u.departmentId === id ? { ...u, departmentName: input.name } : u));
    await writeAll<User>("users", updated);
  }
  return list[idx];
}

export async function deleteDepartment(id: string): Promise<{ message: string }> {
  const list = await listDepartments();
  const next = list.filter((d) => d.id !== id);
  if (next.length === list.length) throw Object.assign(new Error("Department not found"), { status: 404 });
  await writeAll<Department>(COLLECTION, next);

  // 级联删除该部门下的用户与物资（及其借用历史）
  const users = await readAll<User>("users");
  await writeAll<User>("users", users.filter((u) => u.departmentId !== id));

  const items = await readAll<EquipmentItem>("items");
  await writeAll<EquipmentItem>("items", items.filter((it) => it.departmentId !== id));

  return { message: "Department deleted" };
}