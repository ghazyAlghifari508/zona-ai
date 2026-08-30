export function TypingDots() {
  return (
    <span
      data-testid="typing-dots"
      role="status"
      aria-label="Sedang menulis"
      className="inline-flex items-center gap-1 py-2"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink motion-reduce:animate-none"
          style={{
            animationDelay: `${-0.3 + i * 0.15}s`,
            opacity: 1 - i * 0.25,
          }}
        />
      ))}
    </span>
  )
}
