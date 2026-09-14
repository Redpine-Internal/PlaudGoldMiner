const ALLOWED_USER_EMAILS = new Set([
  'fabio.marques@ehsbrasil.com',
  'andreza.araujo@ehsbrasil.com',
]);

export function isAllowedUserEmail(email: string | null | undefined) {
  return ALLOWED_USER_EMAILS.has(email?.trim().toLowerCase() ?? '');
}
