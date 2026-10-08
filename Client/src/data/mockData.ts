// src/data/mockData.ts

export interface MarketPair {
  symbol: string;       // backend key (TECH, MEME, BANK)
  displaySymbol: string; // UI label (BTC/INR, ETH/INR, SOL/INR)
  name: string;
  price: string;
  change: string;
  high: string;
  low: string;
  isPositive: boolean;
  icon?: string;
  iconColor?: string;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'Long' | 'Short';
  size: string;
  entryPrice: string;
  markPrice: string;
  pnl: string;
  roe: string;
  isPositive: boolean;
}

export const MOCK_MARKETS: MarketPair[] = [
  { symbol: 'BTC/INR', name: 'Bitcoin', price: '₹64,230.50', change: '+2.45%', high: '₹65,100.00', low: '₹62,400.00', isPositive: true, icon: '₿', iconColor: 'bg-up' },
  { symbol: 'ETH/INR', name: 'Ethereum', price: '₹3,380.20', change: '-1.12%', high: '₹3,450.00', low: '₹3,210.00', isPositive: false, icon: 'Ξ', iconColor: 'bg-main border border-main' },
  { symbol: 'SOL/INR', name: 'Solana', price: '₹148.45', change: '+5.20%', high: '₹152.00', low: '₹140.00', isPositive: true, icon: 'S', iconColor: 'bg-main border border-main' },
  { symbol: 'AAPL', name: 'Apple Inc.', price: '₹189.45', change: '+0.45%', high: '₹190.50', low: '₹187.20', isPositive: true, icon: '', iconColor: 'bg-main border border-main' },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: '₹175.22', change: '-2.30%', high: '₹180.00', low: '₹172.50', isPositive: false, icon: 'T', iconColor: 'bg-down' },
];

export const MOCK_POSITIONS: Position[] = [
  { id: 'pos-1', symbol: 'BTC/INR', side: 'Long', size: '0.450', entryPrice: '62,450.00', markPrice: '64,230.50', pnl: '+801.22', roe: '+3.2%', isPositive: true },
  { id: 'pos-2', symbol: 'ETH/INR', side: 'Short', size: '2.120', entryPrice: '3,450.00', markPrice: '3,380.20', pnl: '+147.97', roe: '+2.1%', isPositive: true },
  { id: 'pos-3', symbol: 'SOL/INR', side: 'Long', size: '45.00', entryPrice: '152.00', markPrice: '148.45', pnl: '-159.75', roe: '-2.4%', isPositive: false },
];