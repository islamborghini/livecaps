import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";

// Load .env.local
const envContent = fs.readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) {
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

const EMAIL = "admin@test.local";
const PASSWORD = "TestAdmin123!";
const NAME = "Test Admin";

const prisma = new PrismaClient();

const passwordHash = await bcrypt.hash(PASSWORD, 12);

const user = await prisma.user.upsert({
  where: { email: EMAIL },
  update: { passwordHash, tier: "PRO", name: NAME },
  create: { email: EMAIL, passwordHash, tier: "PRO", name: NAME },
});

console.log("User ready:");
console.log("  id:   ", user.id);
console.log("  email:", user.email);
console.log("  tier: ", user.tier);
console.log("  name: ", user.name);
console.log("\nLogin with:");
console.log("  email:   ", EMAIL);
console.log("  password:", PASSWORD);

await prisma.$disconnect();
