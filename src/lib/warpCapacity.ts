import type { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

// Every warp used to be exactly 24 sarees. Tissue warps (made from Jari
// Marcs via createTissueWarp, see tissueWarp.ts) can be 30-40, so anything
// that used to hardcode 24 now looks this up instead. Falls back to 24 for
// legacy WarpAssignments created before dyeingBatchWarp linking existed —
// same fallback convention as the free-text shadeLines legacy path.
export async function getWarpCapacity(tx: TxClient, warpAssignmentId: string): Promise<number> {
  const assignment = await tx.warpAssignment.findUnique({
    where: { id: warpAssignmentId },
    select: { dyeingBatchWarp: { select: { capacity: true } } },
  });
  return assignment?.dyeingBatchWarp?.capacity ?? 24;
}
