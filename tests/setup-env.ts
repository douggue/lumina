// Point Prisma at the test database before any module creates a client.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
