import { Controller, Get } from "@nestjs/common";
import { metricsSnapshot } from "../infrastructure/observability/observability";

@Controller("metrics")
export class MetricsController {
  @Get()
  snapshot() {
    return metricsSnapshot();
  }
}
