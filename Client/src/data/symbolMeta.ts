export interface SymbolMeta {
  displaySymbol: string;
  name: string;
  icon: string;
  iconColor: string;
}

export const SYMBOL_META: Record<string, SymbolMeta> = {
  TECH: { displaySymbol: 'BTC/INR', name: 'Bitcoin',  icon: '₿', iconColor: 'bg-up' },
  MEME: { displaySymbol: 'ETH/INR', name: 'Ethereum', icon: 'Ξ', iconColor: 'bg-main border border-main' },
  BANK: { displaySymbol: 'SOL/INR', name: 'Solana',   icon: 'S', iconColor: 'bg-main border border-main' },
};

export function getSymbolMeta(symbol: string): SymbolMeta {
  return (
    SYMBOL_META[symbol] ?? {
      displaySymbol: symbol,
      name: symbol,
      icon: symbol[0] ?? '?',
      iconColor: 'bg-main border border-main',
    }
  );
}
