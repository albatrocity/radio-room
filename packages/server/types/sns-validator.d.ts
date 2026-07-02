declare module "sns-validator" {
  type ValidateCallback = (err: Error | null, message: Record<string, unknown>) => void

  class MessageValidator {
    constructor(encoding?: string)
    validate(hash: Record<string, unknown>, cb: ValidateCallback): void
  }

  export = MessageValidator
}
