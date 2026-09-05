import { describe, expect, it } from 'vitest';
import { profileInput } from '@/lib/profile/profile-input';

describe('profile input', () => {
  it('permits clearing the optional biography', () => {
    expect(profileInput.parse({ name: ' Fabio ', email: 'fabio@example.com', bio: '' })).toEqual({ name: 'Fabio', email: 'fabio@example.com', bio: '' });
  });
  it('rejects invalid or incomplete identity data', () => {
    expect(profileInput.safeParse({ name: ' ', email: 'fabio@example.com' }).success).toBe(false);
    expect(profileInput.safeParse({ name: 'Fabio', email: 'invalid' }).success).toBe(false);
    expect(profileInput.safeParse(null).success).toBe(false);
  });
});
