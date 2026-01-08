import { AppDataSource } from "../data-source";
import { Category } from "../entities/Category";
import { generateId } from "../utils/store";

export async function listCategories(): Promise<Category[]> {
  const repo = AppDataSource.getRepository(Category);
  return repo.find();
}

export async function addCategory(name: string, color: string): Promise<Category> {
  const repo = AppDataSource.getRepository(Category);
  const category = repo.create({
    id: generateId("cat"),
    name,
    color,
  });
  await repo.save(category);
  return category;
}

export async function deleteCategory(id: string): Promise<{ message: string }> {
  const repo = AppDataSource.getRepository(Category);
  const result = await repo.delete(id);
  if (result.affected === 0) {
    throw Object.assign(new Error("Category not found"), { status: 404 });
  }
  return { message: "Category deleted" };
}
