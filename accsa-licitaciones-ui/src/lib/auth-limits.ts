// Length caps for the auth fields, shared by the screens and the routes behind
// them: the browser stops the typing, the route rejects the body. Without them
// any string, of any size, reached the auth provider.

// RFC 5321: 64 for the local part plus 255 for the domain, 254 in practice.
export const EMAIL_MAX_LENGTH = 254;

// Passwords are hashed with bcrypt, which only reads the first 72 bytes, so
// there is nothing to gain past that. Applies to the password being created.
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 72;

// Signing in has to accept whatever password the account already carries, so it
// caps well above the one we let people create rather than at the same number.
export const LOGIN_PASSWORD_MAX_LENGTH = 128;
