import { useId } from "react";

/** Original decorative artwork; the funding state is explained by nearby text. */
export default function OverflowingCup() {
  const id = useId();
  return (
    <svg className="donation-overflow-cup" viewBox="0 0 108 124" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-glass`} x1="25" y1="25" x2="81" y2="87" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fffef9" />
          <stop offset=".55" stopColor="#e3edf8" />
          <stop offset="1" stopColor="#cdbde4" />
        </linearGradient>
        <linearGradient id={`${id}-wine`} x1="36" y1="27" x2="71" y2="79" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ce6b8b" />
          <stop offset="1" stopColor="#963d60" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="34" y1="0" x2="75" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#b28b43" />
          <stop offset=".45" stopColor="#fff0ba" />
          <stop offset="1" stopColor="#c69e54" />
        </linearGradient>
      </defs>
      <ellipse cx="54" cy="115" rx="30" ry="5" fill="#c6b7da" opacity=".28" />
      <path d="M27 25h54l-3 30C76 72 66 83 54 83S32 72 30 55Z" fill={`url(#${id}-glass)`} stroke="#786487" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M29 33c10-8 19 4 30-1s17-8 21-1l-3 24C75 71 66 80 54 80S34 70 32 55Z" fill={`url(#${id}-wine)`} />
      <path d="M29 31c11-7 21 3 31-1s20-11 28-3c5 5 1 10 2 17 1 6 8 7 10 1 3-9 0-24-9-26-12-4-21 9-33 8s-19-6-29 0Z" fill="#c36586" stroke="#a44b70" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M39 40c-1 13 2 23 8 28" fill="none" stroke="#f8c7d7" strokeWidth="4" strokeLinecap="round" opacity=".8" />
      <path d="M33 29c12-4 20 6 32 0M88 25c5 2 7 7 6 12" fill="none" stroke="#f7b8cc" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M53 84v22m-17 6c8-8 28-8 36 0-6 5-30 5-36 0Z" fill={`url(#${id}-glass)`} stroke="#786487" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M57 86v19m-16 7c8-3 18-3 25 0" fill="none" stroke="#fffef9" strokeWidth="2" strokeLinecap="round" />
      <path d="M94 58c0 0-5 7-5 10a5 5 0 0 0 10 0c0-3-5-10-5-10ZM20 40s-4 6-4 9a4 4 0 0 0 8 0c0-3-4-9-4-9Z" fill="#b9577e" />
      <path d="m18 9 2.5 6.5L27 18l-6.5 2.5L18 27l-2.5-6.5L9 18l6.5-2.5ZM86 86l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill={`url(#${id}-gold)`} stroke="#c3a05b" strokeWidth=".7" strokeLinejoin="round" />
      <circle cx="76" cy="10" r="2.5" fill="#ddc7e9" />
      <circle cx="15" cy="78" r="2" fill="#ddc7e9" />
    </svg>
  );
}
