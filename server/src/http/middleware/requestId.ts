import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function requestId(){
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as any).requestId = randomUUID();
    next();
  };
}
