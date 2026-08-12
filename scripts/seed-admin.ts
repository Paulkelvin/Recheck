import "dotenv/config";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Admin";

  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running this script.");
    process.exit(1);
  }

  const passwordHash = await hash(password, 10);

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, role: "admin", name })
      .where(eq(users.id, existing.id));
    console.log(`Updated existing user ${email} to admin.`);
    return;
  }

  await db.insert(users).values({ email, name, passwordHash, role: "admin" });
  console.log(`Created admin user ${email}.`);
}

main().then(() => process.exit(0));
