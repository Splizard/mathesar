import {
  isIpAddress,
  isIpv4Address,
  isIpv6Address,
  isMacAddress,
} from '../ipAddress';

describe('IP addresses', () => {
  test('are four decimal octets, or eight groups of hex digits', () => {
    expect(isIpv4Address('192.168.0.1')).toBe(true);
    expect(isIpv4Address('0.0.0.0')).toBe(true);
    expect(isIpv4Address('255.255.255.255')).toBe(true);
    expect(isIpv4Address('192.168.0')).toBe(false);
    expect(isIpv4Address('192.168.0.256')).toBe(false);
    expect(isIpv4Address('192.168.0.1.1')).toBe(false);
    expect(isIpv4Address('192.168.0.x')).toBe(false);
    expect(isIpv4Address('')).toBe(false);

    expect(isIpv6Address('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe(true);
    expect(isIpv6Address('2001:db8::1')).toBe(true);
    expect(isIpv6Address('::')).toBe(true);
    expect(isIpv6Address('::1')).toBe(true);
    expect(isIpv6Address('fe80::')).toBe(true);
    expect(isIpv6Address('::ffff:192.168.0.1')).toBe(true);
    expect(isIpv6Address('2001:db8::1::2')).toBe(false);
    expect(isIpv6Address('2001:db8:0:0:0:0:0:0:1')).toBe(false);
    expect(isIpv6Address('2001:db8::12345')).toBe(false);
    expect(isIpv6Address('2001:db8')).toBe(false);
    expect(isIpv6Address('192.168.0.1')).toBe(false);
  });

  test('can have the netmask of their network', () => {
    expect(isIpAddress('192.168.0.1')).toBe(true);
    expect(isIpAddress('192.168.0.0/24')).toBe(true);
    expect(isIpAddress('192.168.0.1/32')).toBe(true);
    expect(isIpAddress('192.168.0.1/33')).toBe(false);
    expect(isIpAddress('2001:db8::/32')).toBe(true);
    expect(isIpAddress('2001:db8::1/128')).toBe(true);
    expect(isIpAddress('2001:db8::1/129')).toBe(false);
    expect(isIpAddress('192.168.0.1/')).toBe(false);
    expect(isIpAddress('192.168.0.1/24/24')).toBe(false);
    expect(isIpAddress('not an address')).toBe(false);
  });

  test('are told apart from MAC addresses', () => {
    expect(isMacAddress('08:00:2b:01:02:03')).toBe(true);
    expect(isMacAddress('08-00-2b-01-02-03')).toBe(true);
    expect(isMacAddress('0800.2b01.0203')).toBe(true);
    expect(isMacAddress('08002b010203')).toBe(true);
    expect(isMacAddress('08:00:2b:ff:fe:01:02:03')).toBe(true);
    expect(isMacAddress('08:00:2b:01:02')).toBe(false);
    expect(isMacAddress('08:00:2b:01:02:0g')).toBe(false);
    expect(isMacAddress('08:00-2b:01:02:03')).toBe(false);
    expect(isMacAddress('192.168.0.1')).toBe(false);
  });
});
