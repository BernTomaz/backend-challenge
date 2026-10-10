import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { Money, MoneyProps } from "../domain/money";
import { WalletLedgerEntryRecord } from "../infrastructure/database/entities/wallet-ledger-entry.record";
import { WalletRecord } from "../infrastructure/database/entities/wallet.record";
import { persistOpenWallet } from "../infrastructure/database/open-wallet-persistence";

interface CreateWalletBody {
  playerId: string;
  initialBalance: MoneyProps;
}

@Controller("wallets")
export class WalletsController {
  constructor(private readonly em: EntityManager) {}

  @Post()
  async create(@Body() body: CreateWalletBody) {
    try {
      validateCreateWalletBody(body);

      const result = await persistOpenWallet(this.em, {
        playerId: body.playerId,
        initialBalance: body.initialBalance,
      });

      return {
        id: result.wallet.id,
        playerId: result.wallet.playerId,
        balance: result.wallet.balance.toJSON(),
        version: result.wallet.version,
      };
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new ConflictException("Wallet already exists for player and currency");
      }

      throw error;
    }
  }

  @Get(":walletId")
  async findById(@Param("walletId") walletId: string) {
    const wallet = await this.em.findOne(WalletRecord, { id: walletId });

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: {
        amount: wallet.balanceAmount,
        currency: wallet.currency,
      },
      version: wallet.version,
    };
  }

  @Get(":walletId/ledger")
  async ledger(
    @Param("walletId") walletId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    const wallet = await this.em.findOne(WalletRecord, { id: walletId });

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    const take = Math.min(Number(limit ?? 50) || 50, 100);
    const offset = decodeCursor(cursor);
    const entries = await this.em.find(
      WalletLedgerEntryRecord,
      { walletId },
      { orderBy: { createdAt: "asc", id: "asc" }, limit: take + 1, offset },
    );
    const page = entries.slice(0, take);

    return {
      items: page.map((entry) => ({
        id: entry.id,
        walletId: entry.walletId,
        transactionId: entry.transactionId,
        direction: entry.direction,
        money: { amount: entry.amount, currency: entry.currency },
        balanceBefore: { amount: entry.balanceBefore, currency: entry.currency },
        balanceAfter: { amount: entry.balanceAfter, currency: entry.currency },
        createdAt: entry.createdAt.toISOString(),
      })),
      nextCursor: entries.length > take ? encodeCursor(offset + take) : undefined,
    };
  }
}

export function validateCreateWalletBody(body: CreateWalletBody): void {
  if (!body || typeof body.playerId !== "string" || body.playerId.trim() === "") {
    throw new BadRequestException("playerId is required");
  }

  if (!body.initialBalance) {
    throw new BadRequestException("initialBalance is required");
  }

  try {
    Money.from(body.initialBalance);
  } catch {
    throw new BadRequestException("initialBalance is invalid");
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }

  const decoded = Number(Buffer.from(cursor, "base64url").toString("utf8"));

  if (!Number.isInteger(decoded) || decoded < 0) {
    throw new BadRequestException("cursor is invalid");
  }

  return decoded;
}
