
import { listDepartments, updateDepartment } from "./services/departmentsService";

async function main() {
  console.log("Starting approval sync...");
  try {
    const depts = await listDepartments();
    for (const dept of depts) {
      console.log(`Syncing department: ${dept.name} (${dept.id})`);
      // Re-apply the current requiresApproval to trigger the sync logic
      // Note: listDepartments fills in defaults, so requiresApproval is boolean
      await updateDepartment(dept.id, { 
          name: dept.name, 
          requiresApproval: dept.requiresApproval 
      });
    }
    console.log("Sync completed successfully.");
  } catch (error) {
    console.error("Sync failed:", error);
  }
}

main();
