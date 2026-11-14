import { SERVICE_PRODUCTS, type ServiceProduct } from '@/config/service';

const CLIENT_ID = /^[A-Za-z0-9._-]{1,64}$/;

export type ClientRegistry = ReadonlyMap<string, ServiceProduct>;
export type RegistryParse = { ok: true; clients: ClientRegistry } | { ok: false; message: string };

const isServiceProduct = (value: string): value is ServiceProduct =>
  (SERVICE_PRODUCTS as readonly string[]).includes(value);

/** "clientA=wallet,clientB=wallet" becomes a map. Strict on purpose: a typo must fail boot, not widen access. */
export function parseServiceClients(raw: string): RegistryParse {
  const clients = new Map<string, ServiceProduct>();
  for (const entry of raw.split(',').map((part) => part.trim()).filter(Boolean)) {
    const [clientId, product, extra] = entry.split('=').map((part) => part.trim());
    if (!clientId || !product || extra !== undefined || !CLIENT_ID.test(clientId)) {
      return { ok: false, message: `Invalid entry "${entry}". Use clientId=product.` };
    }
    if (!isServiceProduct(product)) {
      return { ok: false, message: `"${product}" is not a product a service client can act as.` };
    }
    if (clients.has(clientId)) return { ok: false, message: `Client "${clientId}" is listed twice.` };
    clients.set(clientId, product);
  }
  return { ok: true, clients };
}
