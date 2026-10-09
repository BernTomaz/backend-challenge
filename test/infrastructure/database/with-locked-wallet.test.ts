import { describe, expect, test } from "bun:test";
import { EntityManager, LockMode } from "@mikro-orm/postgresql";
import { withLockedWallet } from "../../../src/infrastructure/database/with-locked-wallet";
import { WalletRecord } from "../../../src/infrastructure/database/entities/wallet.record";

describe("withLockedWallet", () => {
  test("runs work inside a transaction with pessimistic wallet lock", async () => {
    const wallet = new WalletRecord();
    wallet.id = "wallet-1";
    const calls: unknown[] = [];
    const tx = {
      findOneOrFail: async (...args: unknown[]) => {
        calls.push(args);
        return wallet;
      },
    };
    const em = {
      transactional: async (work: (tx: unknown) => Promise<string>) => work(tx),
    } as unknown as EntityManager;

    const result = await withLockedWallet(em, "wallet-1", async (lockedTx, lockedWallet) => {
      expect(lockedTx as unknown).toBe(tx);
      expect(lockedWallet).toBe(wallet);
      return "processed";
    });

    expect(result).toBe("processed");
    expect(calls).toEqual([
      [
        WalletRecord,
        { id: "wallet-1" },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      ],
    ]);
  });
});
