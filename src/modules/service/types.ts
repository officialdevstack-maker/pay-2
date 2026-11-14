import type { Product } from '@/modules/wallet';

/** Who is calling. `product` comes from server config keyed by the verified client id, never from the request. */
export interface ServiceCaller {
  clientId: string;
  product: Product;
}
