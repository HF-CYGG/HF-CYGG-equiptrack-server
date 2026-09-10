import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { createAdmin } from "./init_admin";

/**
 * 手工创建超级管理员。
 *
 * 自动化部署更推荐用环境变量（INITIAL_ADMIN_CONTACT / INITIAL_ADMIN_PASSWORD），
 * 服务启动时会在用户表为空的情况下自动创建。这个脚本用于事后补建，
 * 或者不想把密码写进 .env 的场景。
 *
 * 用法：
 *   docker compose exec equiptrack-server npm run create-admin -- \
 *     --contact 13800000000 --password 'YourStrongPass'
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

  if (!contact || !password) usage();

  await AppDataSource.initialize();

  try {
    const created = await createAdmin({
      contact,
      password,
      name: readArg("name"),
      departmentName: readArg("department"),
      invitationCode: readArg("code"),
    });

    console.log(`
已创建超级管理员：
  登录名  ${created.contact}
  姓名    ${created.name}
  部门    ${created.departmentName}
  邀请码  ${created.invitationCode}

其他人注册时需要填这个邀请码，注册申请由你审批。
邀请码可在 App 的用户管理里修改。
`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    await AppDataSource.destroy();
    process.exit(1);
  }

  await AppDataSource.destroy();
}

main().catch(async (err) => {
  console.error("创建失败：", err);
  process.exit(1);
});
