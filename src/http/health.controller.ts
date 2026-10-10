import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { SQSClient, ListQueuesCommand } from "@aws-sdk/client-sqs";

@Controller("health")
export class HealthController {
  constructor(private readonly em: EntityManager) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    try {
      await this.em.getConnection().execute("select 1");
      await new SQSClient({
        region: process.env.AWS_REGION ?? "us-east-1",
        endpoint: process.env.SQS_ENDPOINT ?? "http://localhost:4566",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
        },
      }).send(new ListQueuesCommand({ MaxResults: 1 }));

      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException("Dependencies are not ready");
    }
  }
}
