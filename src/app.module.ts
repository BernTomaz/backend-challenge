import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import mikroOrmConfig from "./infrastructure/database/mikro-orm.config";
import { WalletsController } from "./http/wallets.controller";
import { HealthController } from "./http/health.controller";
import { MetricsController } from "./http/metrics.controller";
import { ReconciliationController } from "./http/reconciliation.controller";
import { WageringController } from "./http/wagering.controller";
import { WageringTransactionsController } from "./http/wagering-transactions.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot(mikroOrmConfig),
  ],
  controllers: [
    HealthController,
    MetricsController,
    ReconciliationController,
    WalletsController,
    WageringController,
    WageringTransactionsController,
  ],
})
export class AppModule {}
