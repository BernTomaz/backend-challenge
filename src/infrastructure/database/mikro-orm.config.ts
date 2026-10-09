import { defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";

export default defineConfig({
  clientUrl: process.env.DATABASE_URL ?? "postgresql://wagering:wagering@localhost:5432/wagering",
  entities: [],
  migrations: {
    path: "src/infrastructure/database/migrations",
    transactional: true,
    allOrNothing: true,
  },
  extensions: [Migrator],
});
