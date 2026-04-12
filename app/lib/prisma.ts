/**
 * Prisma client singleton for Next.js.
 *
 * In development, Next.js hot-reload creates a new module instance on every
 * change, which would otherwise open a new database connection each time.
 * By caching the client on `globalThis`, we reuse a single connection across
 * reloads. In production, module instances are not reloaded, so a plain export
 * would be fine — but the pattern is kept consistent.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
