import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';

export function CountUp({ value, format }: { value: number; format: (value: number) => string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: latest => setShown(latest),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduced]);

  return <>{format(shown)}</>;
}
