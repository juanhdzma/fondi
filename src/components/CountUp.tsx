import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';

export function CountUp({ value, format }: { value: number; format: (value: number) => string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(reduced ? value : 0);
  const animated = useRef(false);

  useEffect(() => {
    if (reduced || animated.current) {
      setShown(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: latest => setShown(latest),
      onComplete: () => { animated.current = true; },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduced]);

  return <>{format(animated.current ? value : shown)}</>;
}
