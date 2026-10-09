import { MikroORM } from "@mikro-orm/postgresql";
import config from "./mikro-orm.config";

const direction = process.argv[2];
const orm = await MikroORM.init(config);

try {
  const migrator = orm.getMigrator();

  if (direction === "down") {
    await migrator.down();
  } else {
    await migrator.up();
  }
} finally {
  await orm.close(true);
}
