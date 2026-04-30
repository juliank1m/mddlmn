import { useEffect, useRef, useState } from "react";

const CHARS = "█▓▒░@#$%&*+=-_<>?/\\|01ABCDEFGHJKLMNPQRSTVWXYZ";

interface Props {
  text: string;
  className?: string;
  duration?: number; // total ms
  trigger?: number | string; // change to retrigger
}

/**
 * TextScramble — reactbits-inspired text decryption effect.
 * Each character starts as a random glyph, then settles to its target.
 */
export function TextScramble({ text, className, duration = 600, trigger }: Props) {
  const [output, setOutput] = useState(text);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const total = Math.max(duration, 100);
    const targetChars = Array.from(text);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / total);
      const reveal = Math.floor(progress * targetChars.length);
      const next = targetChars
        .map((char, i) => {
          if (i < reveal) return char;
          if (char === " " || char === "\n") return char;
          return CHARS[Math.floor(Math.random() * CHARS.length)];
        })
        .join("");
      setOutput(next);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setOutput(text);
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, trigger, duration]);

  return <span className={className}>{output}</span>;
}
