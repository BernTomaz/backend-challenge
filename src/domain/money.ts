export interface MoneyProps {
  amount: string;
  currency: string;
}

export class Money {
  private constructor(
    private readonly cents: bigint,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    const currency = props.currency.trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error("Invalid currency");
    }

    return new Money(parsePositiveAmount(props.amount), currency);
  }

  static zero(currency: string): Money {
    return Money.from({ amount: "0.00", currency });
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.cents + other.cents, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.cents - other.cents, this.currency);
  }

  negate(): Money {
    return new Money(-this.cents, this.currency);
  }

  isZero(): boolean {
    return this.cents === 0n;
  }

  isPositive(): boolean {
    return this.cents > 0n;
  }

  isNegative(): boolean {
    return this.cents < 0n;
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.cents < other.cents;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.cents === other.cents;
  }

  toJSON(): MoneyProps {
    return {
      amount: formatCents(this.cents),
      currency: this.currency,
    };
  }

  toString(): string {
    return `${this.toJSON().amount} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error("Currency mismatch");
    }
  }
}

function parsePositiveAmount(amount: string): bigint {
  if (!/^(0|[1-9]\d*)\.\d{2}$/.test(amount)) {
    throw new Error("Invalid amount");
  }

  const [units, cents] = amount.split(".");
  return BigInt(units) * 100n + BigInt(cents);
}

function formatCents(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const absolute = cents < 0n ? -cents : cents;
  const units = absolute / 100n;
  const decimals = (absolute % 100n).toString().padStart(2, "0");

  return `${sign}${units}.${decimals}`;
}
