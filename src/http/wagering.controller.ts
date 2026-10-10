import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpStatus,
  Post,
  Res,
} from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { Money, MoneyProps } from "../domain/money";
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../domain/wager-transaction";
import { hashBusinessPayload } from "../application/payload-hash";
import {
  IdempotencyConflictError,
  ProcessHttpWagerTransactionResult,
  processHttpWagerTransaction,
} from "../infrastructure/database/process-http-wager-transaction";

interface SubmitWagerTransactionBody {
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
}

@Controller("wagering/transactions")
export class WageringController {
  constructor(private readonly em: EntityManager) {}

  @Post()
  async submit(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: SubmitWagerTransactionBody,
    @Res({ passthrough: true }) response: { status: (code: number) => void },
  ) {
    validateSubmitWagerTransactionBody(idempotencyKey, body);
    const requiredIdempotencyKey = idempotencyKey;

    try {
      const result = await processHttpWagerTransaction(this.em, {
        ...body,
        idempotencyKey: requiredIdempotencyKey,
        payloadHash: hashBusinessPayload(body as unknown as Record<string, unknown>),
      });
      response.status(statusCodeFor(result));

      return result;
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }
}

export function statusCodeFor(result: ProcessHttpWagerTransactionResult): number {
  if (result.idempotentReplay) {
    return HttpStatus.OK;
  }

  if (result.status === WagerTransactionStatus.PendingReference) {
    return HttpStatus.ACCEPTED;
  }

  if (result.status === WagerTransactionStatus.Rejected) {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }

  if (result.status === WagerTransactionStatus.Failed) {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }

  return HttpStatus.CREATED;
}

export function validateSubmitWagerTransactionBody(
  idempotencyKey: string | undefined,
  body: SubmitWagerTransactionBody,
): asserts idempotencyKey is string {
  if (!idempotencyKey) {
    throw new BadRequestException("Idempotency-Key header is required");
  }

  for (const field of [
    "providerId",
    "externalTransactionId",
    "playerId",
    "walletId",
    "roundId",
    "gameId",
  ] as const) {
    if (typeof body?.[field] !== "string" || body[field].trim() === "") {
      throw new BadRequestException(`${field} is required`);
    }
  }

  if (!Object.values(WagerTransactionKind).includes(body.kind)) {
    throw new BadRequestException("kind is invalid");
  }

  if (body.kind === WagerTransactionKind.Opening) {
    throw new BadRequestException("OPENING cannot be submitted");
  }

  try {
    Money.from(body.money);
  } catch {
    throw new BadRequestException("money is invalid");
  }
}
