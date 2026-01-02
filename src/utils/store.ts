import { promises as fs } from "fs";
import path from "path";
import type { User, Department, Category } from "../models/types";

const BASE_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

async function ensureDir(dir: string) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (_) {
    // ignore
  }
}

function filePath(name: string) {
  return path.join(BASE_DIR, `${name}.json`);
}

export function generateId(prefix = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// In-memory cache
const storeCache: Record<string, any[]> = {};

export async function readAll<T>(name: string): Promise<T[]> {
  if (storeCache[name]) {
    return storeCache[name] as T[];
  }
  const p = filePath(name);
  try {
    const data = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(data) as T[];
    storeCache[name] = parsed;
    return parsed;
  } catch {
    storeCache[name] = [];
    return [] as T[];
  }
}

export async function writeAll<T>(name: string, list: T[]): Promise<void> {
  // Update cache immediately
  storeCache[name] = list;
  
  const p = filePath(name);
  // Write to disk
  await fs.writeFile(p, JSON.stringify(list, null, 2), "utf8");
}

export async function initStore() {
  await ensureDir(BASE_DIR);
  const files = [
    "departments",
    "categories",
    "items",
    "users",
    "registration_requests",
    "borrow_requests",
    "device_tokens",
  ];
  
  // Ensure files exist and load into cache
  for (const f of files) {
    const p = filePath(f);
    try {
      await fs.access(p);
      // Preload into cache
      await readAll(f);
    } catch {
      await fs.writeFile(p, "[]", "utf8");
      storeCache[f] = [];
    }
  }

  // Seed default data
  await seedDefaults();
}

async function seedDefaults() {
  // 1. Departments
  const depts = await readAll<Department>("departments");
  if (depts.length === 0) {
    const defaults: Department[] = [
      { id: "dept_admin", name: "管理部" },
      { id: "dept_tech", name: "技术部" },
      { id: "dept_ops", name: "运营部" },
    ];
    await writeAll("departments", defaults);
    console.log("[Store] Seeded default departments");
  }

  // 2. Categories
  const cats = await readAll<Category>("categories");
  if (cats.length === 0) {
    const defaults: Category[] = [
      { id: "cat_computer", name: "电脑/配件", color: "#FF5733" },
      { id: "cat_camera", name: "摄影器材", color: "#33FF57" },
      { id: "cat_sound", name: "音频设备", color: "#3357FF" },
    ];
    await writeAll("categories", defaults);
    console.log("[Store] Seeded default categories");
  }

  // 3. Super Admin
  const users = await readAll<User>("users");
  if (users.length === 0) {
    const admin: User = {
      id: generateId("user"),
      name: "系统管理员",
      contact: "furry",
      departmentId: "dept_admin",
      departmentName: "管理部",
      role: "超级管理员",
      status: "active",
      password: "1330",
    };
    await writeAll("users", [admin]);
    console.log("[Store] Seeded default super admin (13800000000 / admin123)");
  }
}
