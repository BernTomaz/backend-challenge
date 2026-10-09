import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

const app = await NestFactory.create(AppModule);
const port = Number(process.env.APP_PORT ?? 3000);

await app.listen(port);
