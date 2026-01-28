// Custom error classes
export class CheckerError extends Error {
  constructor(
    message: string,
    public checkerName: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'CheckerError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class CacheError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'CacheError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'DatabaseError';
  }
}
