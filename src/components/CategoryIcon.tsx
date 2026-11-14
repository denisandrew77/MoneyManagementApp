import { Briefcase, Car, Coffee, Dumbbell, Ellipsis, Fuel, Gamepad2, Gift, GraduationCap, HeartPulse, House, PawPrint, PiggyBank, Plane, ReceiptText, Shirt, ShoppingBasket, Smartphone, Utensils, WalletCards } from 'lucide-react';
export const CATEGORY_ICONS = [
  { name:'wallet', label:'Wallet', icon:WalletCards }, { name:'receipt', label:'Expenses', icon:ReceiptText },
  { name:'fuel', label:'Fuel', icon:Fuel }, { name:'savings', label:'Savings', icon:PiggyBank },
  { name:'groceries', label:'Groceries', icon:ShoppingBasket }, { name:'food', label:'Food', icon:Utensils },
  { name:'home', label:'Home', icon:House }, { name:'car', label:'Car', icon:Car },
  { name:'travel', label:'Travel', icon:Plane }, { name:'health', label:'Health', icon:HeartPulse },
  { name:'education', label:'Education', icon:GraduationCap }, { name:'gifts', label:'Gifts', icon:Gift },
  { name:'entertainment', label:'Entertainment', icon:Gamepad2 }, { name:'clothing', label:'Clothing', icon:Shirt },
  { name:'phone', label:'Phone', icon:Smartphone }, { name:'work', label:'Work', icon:Briefcase },
  { name:'fitness', label:'Fitness', icon:Dumbbell }, { name:'coffee', label:'Coffee', icon:Coffee },
  { name:'pets', label:'Pets', icon:PawPrint }, { name:'other', label:'Other', icon:Ellipsis },
];
export function CategoryIcon({ name, size=19 }: { name?:string | null; size?:number }) {
  const Icon = CATEGORY_ICONS.find(item=>item.name===name)?.icon ?? WalletCards;
  return <Icon size={size} aria-hidden="true"/>;
}
