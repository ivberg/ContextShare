import { Request, Response, NextFunction } from 'express';
import { logger } from '../../logging/logger';

export interface UserContext { anonymous: boolean; sub?: string; }

// Phase 0: no real validation yet, just placeholder demonstrating hook
export function authGuard(){
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.headers['authorization'];
    if(auth){
      // future: decode & validate
      (req as any).user = { anonymous: false, sub: 'placeholder' } as UserContext;
    } else {
      (req as any).user = { anonymous: true } as UserContext;
    }
    logger.info({ event: 'auth_guard', hasAuth: !!auth, requestId: (req as any).requestId });
    next();
  };
}
