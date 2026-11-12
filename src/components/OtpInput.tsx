import { useRef, useEffect, KeyboardEvent, ClipboardEvent } from "react";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  fg: string;
  inputBorder: string;
  accentColor: string;
  isDark: boolean;
}

export default function OtpInput({
  value,
  onChange,
  length = 6,
  fg,
  inputBorder,
  accentColor,
  isDark,
}: OtpInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, "").split("").slice(0, length);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const focusNext = (idx: number) => {
    if (idx < length - 1) inputs.current[idx + 1]?.focus();
  };

  const focusPrev = (idx: number) => {
    if (idx > 0) inputs.current[idx - 1]?.focus();
  };

  const handleChange = (idx: number, char: string) => {
    if (!/^\d$/.test(char)) return;
    const arr = digits.slice();
    arr[idx] = char;
    onChange(arr.join("").replace(/\s/g, ""));
    focusNext(idx);
  };

  const handleKeyDown = (idx: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const arr = digits.slice();
      if (arr[idx] && arr[idx] !== " ") {
        arr[idx] = " ";
        onChange(arr.join("").trim());
      } else {
        focusPrev(idx);
        arr[idx > 0 ? idx - 1 : 0] = " ";
        onChange(arr.join("").trim());
      }
    } else if (e.key === "ArrowLeft") {
      focusPrev(idx);
    } else if (e.key === "ArrowRight") {
      focusNext(idx);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pasted) {
      onChange(pasted);
      const focusIdx = Math.min(pasted.length, length - 1);
      setTimeout(() => inputs.current[focusIdx]?.focus(), 0);
    }
  };

  return (
    <div className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={d === " " ? "" : d}
          onChange={(e) => handleChange(i, e.target.value.slice(-1))}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          onFocus={(e) => e.target.select()}
          className="text-center text-xl font-semibold outline-none transition-all duration-200"
          style={{
            width: 44,
            height: 52,
            borderRadius: "var(--radius-input)",
            border: `1.5px solid ${d && d !== " " ? accentColor : inputBorder}`,
            background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
            color: fg,
            caretColor: accentColor,
            fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
          }}
        />
      ))}
    </div>
  );
}
