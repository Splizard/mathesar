/**
 * @file
 * Whether the text of an IP column's value is one PostgreSQL will take, so
 * that a cell can say so before the database does.
 *
 * These check the form of a value, not everything PostgreSQL does: it also
 * rejects a `cidr` with bits set beyond its netmask, which it says so clearly
 * enough for us to leave to it.
 */

const isDecimalOctet = (part: string) =>
  /^\d{1,3}$/.test(part) && Number(part) <= 255;

/** Four decimal octets, as `192.168.0.1` */
export function isIpv4Address(text: string): boolean {
  const parts = text.split('.');
  return parts.length === 4 && parts.every(isDecimalOctet);
}

const isHextet = (part: string) => /^[0-9a-fA-F]{1,4}$/.test(part);

/**
 * Up to eight groups of hex digits, as `2001:db8::1`, where `::` stands for
 * the groups of zeroes left out, and the last two groups can be written as an
 * IPv4 address.
 */
export function isIpv6Address(text: string): boolean {
  const halves = text.split('::');
  if (halves.length > 2) return false;
  const isShortened = halves.length === 2;
  const groups = halves.map((half) => (half === '' ? [] : half.split(':')));
  const [before, after = []] = groups;
  const parts = [...before, ...after];
  if (parts.some((part) => part === '')) return false;
  // An IPv4 address at the end stands for the last two groups
  const endsWithIpv4 =
    parts.length > 0 && isIpv4Address(parts[parts.length - 1]);
  const hextets = endsWithIpv4 ? parts.slice(0, -1) : parts;
  if (!hextets.every(isHextet)) return false;
  const count = hextets.length + (endsWithIpv4 ? 2 : 0);
  return isShortened ? count <= 7 : count === 8;
}

function hasValidNetmask(netmask: string, isIpv6: boolean): boolean {
  if (!/^\d{1,3}$/.test(netmask)) return false;
  return Number(netmask) <= (isIpv6 ? 128 : 32);
}

/**
 * An IPv4 or IPv6 address, with the netmask of its network where it has one,
 * as `inet` and `cidr` columns hold.
 */
export function isIpAddress(text: string): boolean {
  const [address, netmask, ...rest] = text.split('/');
  if (rest.length > 0) return false;
  const isIpv6 = isIpv6Address(address);
  if (!isIpv6 && !isIpv4Address(address)) return false;
  return netmask === undefined || hasValidNetmask(netmask, isIpv6);
}

/**
 * A MAC-48 or EUI-64 address, in any of the forms PostgreSQL takes: six or
 * eight bytes of hex digits, separated by colons, dashes or dots, in halves,
 * or not separated at all.
 */
export function isMacAddress(text: string): boolean {
  const digits = text.replace(/[:.-]/g, '');
  if (!/^[0-9a-fA-F]+$/.test(digits)) return false;
  if (digits.length !== 12 && digits.length !== 16) return false;
  const separators = text.match(/[:.-]/g) ?? [];
  if (separators.length === 0) return true;
  // The separators have to be the same one, evenly spaced
  if (new Set(separators).size > 1) return false;
  const groups = text.split(/[:.-]/);
  const sizes = new Set(groups.map((group) => group.length));
  return sizes.size === 1;
}
