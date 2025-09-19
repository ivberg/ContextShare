import { Request, Response, NextFunction } from 'express';
import { logger } from '../../logging/logger';

export interface UserContext { anonymous: boolean; sub?: string; }

// Extend the Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
      requestId?: string;
    }
  }
}

// Phase 0: no real validation yet, just placeholder demonstrating hook
export function authGuard(): (req: Request, _res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.headers['authorization'];
    if(auth){
      // future: decode & validate
      req.user = { anonymous: false, sub: 'placeholder' } as UserContext;
    } else {
      req.user = { anonymous: true } as UserContext;
    }
    logger.info({ event: 'auth_guard', hasAuth: !!auth, requestId: req.requestId });
    next();
  };
}
