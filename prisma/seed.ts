/**
 * Starter content: npm run db:seed (needs DATABASE_URL and ENCRYPTION_KEY).
 * The same catalog can be loaded from the browser at /admin/setup on a fresh site.
 */
import { PrismaClient } from "@prisma/client";
import { seedDemoCatalog } from "../src/lib/demo-catalog";

const prisma = new PrismaClient();

seedDemoCatalog(prisma)
  .then((r) => console.log(`Seeded ${r.categories} categories and ${r.products} products.`))
  .finally(() => prisma.$disconnect());
