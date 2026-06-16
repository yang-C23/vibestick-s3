import Ajv, { type ValidateFunction } from 'ajv';
import { normalizerResultSchema, type NormalizerResult } from '@vibestick/protocol';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn: ValidateFunction = ajv.compile(normalizerResultSchema);

export function isValidResult(obj: unknown): obj is NormalizerResult {
  return validateFn(obj) === true;
}

export function validationErrors(): string {
  return ajv.errorsText(validateFn.errors);
}
