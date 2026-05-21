/** TipGuard wordmark + shield mark (landing, auth, nav). */
export function TipGuardLogo({
  size = "md",
  showWordmark = true,
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`tg-logo tg-logo--${size} ${className}`.trim()} aria-hidden={showWordmark ? undefined : true}>
      <span className="tg-logo-mark" aria-hidden>
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
          <path
            d="M16 2.5L6 7.2v8.1c0 6.2 4.3 12 10 14.2 5.7-2.2 10-8 10-14.2V7.2L16 2.5z"
            fill="url(#tg-shield)"
          />
          <path
            d="M16 9.5l-4.2 2.4v4.1c0 2.9 1.8 5.6 4.2 6.6 2.4-1 4.2-3.7 4.2-6.6v-4.1L16 9.5z"
            fill="rgba(10,10,10,0.35)"
          />
          <defs>
            <linearGradient id="tg-shield" x1="6" y1="2" x2="26" y2="30" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fde68a" />
              <stop offset="0.45" stopColor="#fbbf24" />
              <stop offset="1" stopColor="#d97706" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      {showWordmark ? <span className="tg-logo-text">TipGuard</span> : null}
    </span>
  );
}
