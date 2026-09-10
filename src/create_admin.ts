import "reflect-metadata";
import crypto from "crypto";
import { AppDataSource } from "./data-source";
import { User } from "./entities/User";
import { Department } from "./entities/Department";
import { hashPassword } from "./services/authService";
import { generateId } from "./utils/store";

/**
 * 创建初始超级管理员。
 *
 * 全新部署的库里一个用户都没有，而注册接口要求邀请码必须属于某位在职管理者，
 * 于是「第一个账号」无法通过接口自助创建。这个脚本就是那个入口，只在初始化时用一次。
 *
 * 用法（在 server 目录或容器内）：
 *   npm run create-admin -- --contact 13800000000 --password 'YourStrongPass'
 *
 * 可选参数：
 *   --name        显示名称，默认「超级管理员」
 *   --department  所属部门名，不存在则自动创建，默认「总部」
 *   --code        邀请码，留空则随机生成并在结束时打印
 */

function readArg(name: string): string | undefined {
  const prefixed = `--${name}=`;
  const inline = process.argv.find((a) => a.startsWith(prefixed));
  if (inline) return inline.slice(prefixed.length);

  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return undefined;
}

function usage(): never {
  console.error(`
用法：npm run create-admin -- --contact <登录名/手机号> --password <密码>

可选：
  --name        显示名称，默认「超级管理员」
  --department  所属部门名，不存在则自动创建，默认「总部」
  --code        邀请码，留空则随机生成
`);
  process.exit(1);
}

async function main() {
  const contact = readArg("contact");
  const password = readArg("password");
  const name = readArg("name") || "超级管理员";
  const departmentName = readArg("department") || "总部";
  const invitationCode = readArg("code") || crypto.randomBytes(4).toString("hex").toUpperCase();

  if (!contact || !password) usage();

  if (password.length < 8) {
    console.error("密码至少 8 位。");
    process.exit(1);
  }

  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  const deptRepo = AppDataSource.getRepository(Department);

  const existing = await userRepo.findOneBy({ contact });
  if (existing) {
    console.error(`联系方式 ${contact} 已被占用（当前角色：${existing.role}），未做任何修改。`);
    await AppDataSource.destroy();
    process.exit(1);
  }

  let department = await deptRepo.findOneBy({ name: departmentName });
  if (!department) {
    department = deptRepo.create({
      id: generateId("dept"),
      name: departmentName,
      requiresApproval: true,
      order: 0,
    });
    await deptRepo.save(department);
    console.log(`已创建部门「${departmentName}」`);
  }

  const admin = userRepo.create({
    id: generateId("user"),
    name,
    contact,
    departmentId: department.id,
    departmentName: department.name,
    role: "超级管理员",
    status: "active",
    password: hashPassword(password),
    invitationCode,
  });
  await userRepo.save(admin);

  console.log(`
已创建超级管理员：
  登录名  ${contact}
  姓名    ${name}
  部门    ${department.name}
  邀请码  ${invitationCode}

其他人注册时需要填这个邀请码，注册申请由你审批。
邀请码可在 App 的用户管理里修改。
`);

  await AppDataSource.destroy();
}

main().catch(async (err) => {
  console.error("创建失败：", err);
  process.exit(1);
});
