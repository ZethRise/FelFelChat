import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

const username = process.env.SUPERADMIN_USERNAME || "admin";
const displayName = process.env.SUPERADMIN_DISPLAY_NAME || "Super Admin";

async function main() {
  const existing = await prisma.user.findFirst({
    where: { isSuperAdmin: true },
  });
  if (existing) {
    console.log(`[felfel] superadmin already exists: ${existing.username}`);
    return;
  }

  const password = process.env.SUPERADMIN_PASSWORD || randomBytes(12).toString("base64url");
  const hashed = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({
    data: {
      username,
      displayName,
      password: hashed,
      isSuperAdmin: true,
    },
  });

  if (process.env.SUPERADMIN_PASSWORD) {
    console.log(`[felfel] created superadmin: ${admin.username}`);
  } else {
    console.log(`[felfel] created superadmin: ${admin.username}`);
    console.log(`[felfel] generated SUPERADMIN_PASSWORD=${password}`);
    console.log("[felfel] change this password after first login");
  }
}

main()
  .catch((error) => {
    console.error("[felfel] seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
