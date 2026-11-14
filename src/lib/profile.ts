// Google can provide a full name in surname-first order. Prefer explicit given-name fields.
export function greetingName(metadata: Record<string, unknown>, identities: { provider?: string; identity_data?: Record<string, unknown> }[] = []) {
  const google = identities.find(identity => identity.provider === 'google')?.identity_data;
  const candidates = [metadata.given_name, google?.given_name, metadata.first_name, google?.first_name];
  const name = candidates.find(value => typeof value === 'string' && value.trim());
  // This is Denis's personal app; do not guess a given name from full_name.
  return typeof name === 'string' ? name.trim() : 'Denis';
}
