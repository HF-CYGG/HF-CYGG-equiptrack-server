import { readAll, writeAll, generateId } from "../utils/store";
import type { Category } from "../models/types";

const COLLECTION = "categories";

export async function listCategories(): Promise<Category[]> {
  return readAll<Category>(COLLECTION);
}

export async function addCategory(input: { name: string; color: string }): Promise<Category> {
  const list = await listCategories();
  const cat: Category = { id: generateId("cat"), name: input.name, color: input.color };
  list.push(cat);
  await writeAll<Category>(COLLECTION, list);
  return cat;
}

export async function deleteCategory(id: string): Promise<{ message: string }> {
  let list = await listCategories();
  const initialLength = list.length;
  list = list.filter((c) => c.id !== id);
  
  if (list.length === initialLength) {
    throw new Error("Category not found");
  }

  await writeAll<Category>(COLLECTION, list);
  return { message: "Category deleted" };
}