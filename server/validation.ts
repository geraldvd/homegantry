/**
 * zod schemas for every request body, route parameter and query string the API accepts.
 * Unknown fields are rejected, strings are length-limited and URLs must be http(s) so nothing a
 * client stores can turn into a `javascript:` link on someone else's dashboard.
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { safeHttpUrl } from './urls.js';

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Container ids/names, manual service ids and compose project names; safe as object keys. */
const key = z
  .string()
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'letters, digits, ".", "_" and "-" only')
  .refine((k) => !RESERVED_KEYS.has(k), 'reserved name');

/** An http(s) URL; userinfo (`user:pass@`) is stripped so credentials are never stored. */
const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => safeHttpUrl(value) !== undefined, 'must be an http(s) URL')
  .transform((value) => safeHttpUrl(value)!);
/** Service link: an http(s) URL, or "#" for "no link". */
const serviceUrl = z.union([z.literal('#'), httpUrl]);
/** dashboard-icons slug (`jellyfin`), an http(s) image URL, or empty for the letter fallback. */
const icon = z.union([
  z.literal(''),
  z
    .string()
    .max(100)
    .regex(/^[a-z0-9][a-z0-9._-]*$/i, 'icon slug'),
  httpUrl,
]);
const name = z.string().trim().min(1).max(100);
const category = z.string().trim().max(50);
const description = z.string().trim().max(300);
const sortOrder = z.number().int().min(-1_000_000).max(1_000_000);

export const idParams = z.object({ id: key });
export const stackParams = z.object({ name: key });

export const servicesQuery = z.object({
  includeHidden: z.enum(['true', 'false']).optional(),
});

export const overrideBody = z.strictObject({
  displayName: name.optional(),
  url: serviceUrl.optional(),
  icon: icon.optional(),
  category: category.optional(),
  description: description.optional(),
  hidden: z.boolean().optional(),
  sortOrder: sortOrder.optional(),
});

const manualFields = {
  displayName: name,
  url: httpUrl,
  icon,
  category,
  description,
  sortOrder,
};

export const manualCreateBody = z.strictObject({
  ...manualFields,
  icon: icon.default(''),
  category: category.default(''),
  description: description.default(''),
  sortOrder: sortOrder.default(0),
});

export const manualUpdateBody = z.strictObject(manualFields).partial();

export const stackBody = z.strictObject({
  visible: z.boolean().optional(),
  icon: icon.optional(),
  displayName: z.string().trim().max(100).optional(),
});

export const settingsBody = z.strictObject({
  dashboardTitle: name.optional(),
  columns: z.number().int().min(1).max(6).optional(),
  showStatus: z.boolean().optional(),
  layout: z.enum(['grid', 'list']).optional(),
  showStopped: z.boolean().optional(),
  groupBy: z.enum(['category', 'stack']).optional(),
});

interface Schemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

/**
 * Validate the request against the given schemas; responds 400 with the failing fields.
 * The parsed (trimmed, defaulted) body replaces `req.body`.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const issues: Array<{ path: string; message: string }> = [];
    let body: unknown = req.body;
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push({ path: [part, ...issue.path].join('.'), message: issue.message });
        }
      } else if (part === 'body') {
        body = result.data;
      }
    }
    if (issues.length > 0) {
      res.status(400).json({ error: 'invalid request', issues });
      return;
    }
    req.body = body;
    next();
  };
}
