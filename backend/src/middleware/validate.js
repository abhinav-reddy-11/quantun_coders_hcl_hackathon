import { ApiError } from './errors.js';

/** Validates that the named route params are positive integers and converts them. */
export const intParams = (...names) => (req, res, next) => {
  for (const n of names) {
    const v = Number(req.params[n]);
    if (!Number.isInteger(v) || v <= 0) {
      return next(new ApiError(400, 'INVALID_PARAMETER', `Parameter '${n}' must be a positive integer`));
    }
    req.params[n] = v;
  }
  next();
};

export function optionalIntInRange(value, name, min, max, fallback) {
  if (value === undefined || value === null) return fallback;
  const v = Number(value);
  if (!Number.isInteger(v) || v < min || v > max) {
    throw new ApiError(400, 'INVALID_BODY', `'${name}' must be an integer between ${min} and ${max}`);
  }
  return v;
}
