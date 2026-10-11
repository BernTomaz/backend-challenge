import "reflect-metadata";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "../infrastructure/database/mikro-orm.config";
import { reprocessPendingReferences } from "../infrastructure/database/reprocess-pending-references";

let stopping = false;
process.once("SIGTERM", () => { stopping = true; });
process.once("SIGINT", () => { stopping = true; });

const orm = await MikroORM.init(config);

try {
  while (!stopping) {
    await reprocessPendingReferences({
      em: orm.em.fork(),
      limit: Number(process.env.PENDING_REFERENCE_BATCH_SIZE ?? 10),
    });
    await new Promise((resolve) =>
      setTimeout(resolve, Number(process.env.PENDING_REFERENCE_INTERVAL_MS ?? 1000)),
    );
  }
} finally {
  await orm.close(true);
}
