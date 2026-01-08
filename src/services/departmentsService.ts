import { AppDataSource } from "../data-source";
import { Department } from "../entities/Department";
import { generateId } from "../utils/store";

export async function listDepartments(): Promise<Department[]> {
  const repo = AppDataSource.getRepository(Department);
  return repo.find({
      order: {
          order: "ASC"
      }
  });
}

export async function addDepartment(name: string, parentId?: string): Promise<Department> {
  const repo = AppDataSource.getRepository(Department);
  const dept = repo.create({
    id: generateId("dept"),
    name,
    parentId,
    requiresApproval: true, // Default
    order: 0 // Default
  });
  await repo.save(dept);
  return dept;
}

export async function updateDepartment(id: string, input: Partial<Department>): Promise<Department> {
  const repo = AppDataSource.getRepository(Department);
  let dept = await repo.findOneBy({ id });
  if (!dept) throw Object.assign(new Error("Department not found"), { status: 404 });
  
  repo.merge(dept, input);
  await repo.save(dept);
  return dept;
}

export async function updateDepartmentStructure(updates: { id: string; parentId?: string; order: number }[]): Promise<Department[]> {
  const repo = AppDataSource.getRepository(Department);
  
  // We can process in parallel or transaction
  await AppDataSource.transaction(async manager => {
      for (const update of updates) {
          await manager.update(Department, update.id, {
              parentId: update.parentId ?? undefined,
              order: update.order
          });
      }
  });
  
  return listDepartments();
}

export async function deleteDepartment(id: string): Promise<{ message: string }> {
  const repo = AppDataSource.getRepository(Department);
  const result = await repo.delete(id);
  if (result.affected === 0) {
    throw Object.assign(new Error("Department not found"), { status: 404 });
  }
  return { message: "Department deleted" };
}
