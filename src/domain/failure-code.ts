export enum FailureCode {
  InsufficientBalance = "INSUFFICIENT_BALANCE",
  MissingReference = "MISSING_REFERENCE",
  ReferenceNotFound = "REFERENCE_NOT_FOUND",
  InvalidReference = "INVALID_REFERENCE",
  DuplicateReversal = "DUPLICATE_REVERSAL",
  RollbackWouldMakeBalanceNegative = "ROLLBACK_WOULD_MAKE_BALANCE_NEGATIVE",
  InfrastructureFailure = "INFRASTRUCTURE_FAILURE",
}
