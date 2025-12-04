import { readAll, writeAll, generateId } from "../utils/store";
import type { Department, User, EquipmentItem } from "../models/types";

const COLLECTION = "departments";

export async function listDepartments(): Promise<Department[]> {
  return readAll<Department>(COLLECTION);
}

export async function addDepartment(input: { name: string }): Promise<Department> {
  const list = await listDepartments();
  if (list.find((d) => d.name === input.name)) {
    throw Object.assign(new Error("该部门名称已存在。"), { status: 400 });
  }
  const dept: Department = { id: generateId("dept"), name: input.name };
  list.push(dept);
  await writeAll<Department>(COLLECTION, list);
  return dept;
}

export async function updateDepartment(id: string, input: { name: string }): Promise<Department> {
  const list = await listDepartments();
  const idx = list.findIndex((d) => d.id === id);
  if (idx === -1) throw Object.assign(new Error("Department not found"), { status: 404 });
  list[idx].name = input.name;
  await writeAll<Department>(COLLECTION, list);

  // 同步更新用户的 departmentName
  const users = await readAll<User>("users");
  const updated = users.map((u) => (u.departmentId === id ? { ...u, departmentName: input.name } : u));
  await writeAll<User>("users", updated);
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