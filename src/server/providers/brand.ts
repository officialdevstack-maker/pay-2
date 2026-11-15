import 'server-only';

const VENDOR_BRANDS = /flutterwave|\bflw\b|ravepay|paystack|monnify|squad(?:co)?\b|opay|moniepoint/i;

export const isBrandSafe = (text: string): boolean => !VENDOR_BRANDS.test(text);
