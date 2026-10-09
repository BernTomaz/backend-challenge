import { Money } from "./money";

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletBalanceChange {
  balanceBefore: Money;
  balanceAfter: Money;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: {
    id: string;
    playerId: string;
    initialBalance: Money;
  }): Wallet {
    if (props.initialBalance.isNegative()) {
      throw new Error("Initial balance cannot be negative");
    }

    const now = new Date();

    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      now,
      now,
    );
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(money: Money, at = new Date()): WalletBalanceChange {
    this.assertSameCurrency(money);

    if (this._balance.isLessThan(money)) {
      throw new Error("Insufficient balance");
    }

    return this.applyBalance(this._balance.subtract(money), at);
  }

  credit(money: Money, at = new Date()): WalletBalanceChange {
    this.assertSameCurrency(money);
    return this.applyBalance(this._balance.add(money), at);
  }

  private applyBalance(nextBalance: Money, at: Date): WalletBalanceChange {
    const balanceBefore = this._balance;

    if (balanceBefore.equals(nextBalance)) {
      return { balanceBefore, balanceAfter: nextBalance };
    }

    this._balance = nextBalance;
    this._version += 1;
    this._updatedAt = at;

    return { balanceBefore, balanceAfter: nextBalance };
  }

  private assertSameCurrency(money: Money): void {
    if (this.currency !== money.currency) {
      throw new Error("Currency mismatch");
    }
  }
}
