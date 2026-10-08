import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodTypeAny } from 'zod';

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: AnyZodObject;
}

/** Parses and replaces req.body / req.query / req.params with the validated (coerced) values. */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      next();
    } catch (err) {
      next(err);
    }
  };
}
