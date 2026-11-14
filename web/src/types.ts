export type Light = 'low' | 'medium' | 'bright';
export type SizeLabel = 'S' | 'M' | 'L';
export type Sort = 'featured' | 'price-asc' | 'price-desc' | 'name' | 'rating';

export interface PlantSummary {
  id: string;
  name: string;
  latinName: string;
  price: number;
  light: Light;
  careLevel: 1 | 2 | 3;
  petSafe: boolean;
  stock: number;
  rating: number;
  imageUrl: string;
}

export interface Plant extends PlantSummary {
  description: string;
  sizes: { label: SizeLabel; priceDelta: number }[];
  similar: string[];
}

export interface PlantList {
  items: PlantSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface CartLine {
  id: string;
  plantId: string;
  name: string;
  size: SizeLabel;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  stock: number;
  imageUrl: string;
}

export interface Cart {
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  discount: number;
  promoCode: string | null;
  shipping: number;
  total: number;
}

export interface ShippingAddress {
  fullName: string;
  address: string;
  city: string;
  postalCode: string;
}

export interface Order {
  id: string;
  status: 'placed';
  createdAt: string;
  lines: Omit<CartLine, 'stock'>[];
  subtotal: number;
  discount: number;
  promoCode: string | null;
  shipping: number;
  total: number;
  shippingAddress: ShippingAddress;
}
