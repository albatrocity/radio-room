import { Request, Response, NextFunction } from "express"
import { AppContext } from "./context"

// Extend the Express Request type to include our context
declare global {
  namespace Express {
    interface Request {
      context: AppContext
    }
  }
}

/**
 * Middleware that attaches the AppContext to each request object
 */
export const createContextMiddleware = (context: AppContext) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.context = context
    next()
  }
}
