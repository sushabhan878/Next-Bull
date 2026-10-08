import { useEffect, useRef, useState } from 'react';

interface AnimatedValueProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  size?: 'sm' | 'md' | 'lg';
  showFlash?: boolean;
}

export function AnimatedValue({ value, prefix = '', suffix = '', decimals = 2, size = 'md', showFlash = true }: AnimatedValueProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      if (showFlash) {
        setFlash(value > prevValue.current ? 'up' : 'down');
        setTimeout(() => setFlash(null), 600);
      }
      // Animate the number
      const start = prevValue.current;
      const end = value;
      const duration = 300;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        setDisplayValue(start + (end - start) * eased);
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
      prevValue.current = value;
    }
  }, [value, showFlash]);

  const sizeClass = size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-sm';
  const flashClass = flash === 'up' ? 'text-up' : flash === 'down' ? 'text-down' : '';

  return (
    <span className={`font-mono transition-colors duration-300 ${sizeClass} ${flashClass}`}>
      {prefix}{displayValue.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}
