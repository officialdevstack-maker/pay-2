import { describe, expect, it } from 'vitest';
import { AppError, toErrorBody } from './errors';

describe('errors', () => {
  it('maps AppError to its status and message', () => {
    const { status, body } = toErrorBody(new AppError('FORBIDDEN', 'Not allowed.'), 'req_1');
    expect(status).toBe(403);
    expect(body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Not allowed.',
      requestId: 'req_1',
    });
  });

  it('hides internals for unknown errors', () => {
    const { status, body } = toErrorBody(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });
});
