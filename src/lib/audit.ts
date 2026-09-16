import type { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

export async function writeAuditLog(
  tx: TxClient,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  before?: unknown,
  after?: unknown
) {
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      before: before === undefined ? undefined : (before as Prisma.InputJsonValue),
      after: after === undefined ? undefined : (after as Prisma.InputJsonValue),
    },
  });
}
