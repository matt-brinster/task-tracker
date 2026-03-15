import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

const isTest = process.env.NODE_ENV === 'test'

/**
 * Per-IP rate limit for unauthenticated routes (e.g. /auth/redeem).
 * Tight limit to protect against brute-forcing invitation keys.
 */
export const ipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skip: () => isTest,
})

/**
 * Per-user rate limit for authenticated routes.
 * Keyed on req.userId (set by auth middleware before this runs).
 */
export const userLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? ipKeyGenerator(req.ip ?? 'unknown'),
  message: { error: 'Too many requests, please try again later' },
  skip: () => isTest,
})
