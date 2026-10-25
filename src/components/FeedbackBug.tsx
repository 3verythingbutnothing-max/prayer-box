/** A quiet little companion for the bug-report form. Decorative and still. */
export default function FeedbackBug({
  className = "",
}: {
  className?: string;
}) {
  return (
    <svg
      className={`feedback-bug ${className}`.trim()}
      width="240"
      height="200"
      viewBox="0 0 240 200"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="120" cy="107" rx="81" ry="75" fill="#EEF5FA" />
      <ellipse cx="120" cy="179" rx="47" ry="6" fill="#2F4B68" opacity=".07" />

      <g
        stroke="#6D587F"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g>
          <path d="M75 109c-13-7-21-6-25-1m20 23c-15 0-21 4-23 11m32 9c-13 5-18 13-17 20" />
          <path d="M165 109c13-7 21-6 25-1m-20 23c15 0 21 4 23 11m-32 9c13 5 18 13 17 20" />
        </g>

        <path d="M111 54c-3-10-8-15-15-13m33 13c3-10 8-15 15-13" />
        <circle cx="95" cy="41" r="4" fill="#FFE5D8" />
        <circle cx="145" cy="41" r="4" fill="#FFE5D8" />

        <path
          d="M120 82c-33 0-52 21-52 48 0 27 20 44 52 44s52-17 52-44c0-27-19-48-52-48Z"
          fill="#D4CEE6"
        />
        <path d="M119 84c-29-2-48 18-48 45 0 25 18 42 48 43Z" fill="#EAE2FF" />
        <path d="M121 84c29-2 48 18 48 45 0 25-18 42-48 43Z" fill="#DFECF7" />
        <path d="M120 87v83" strokeWidth="2" />

        <ellipse cx="120" cy="68" rx="25" ry="23" fill="#FFE5D8" />
        <ellipse
          cx="104"
          cy="75"
          rx="5"
          ry="3.2"
          fill="#E8B2BD"
          stroke="none"
        />
        <ellipse
          cx="136"
          cy="75"
          rx="5"
          ry="3.2"
          fill="#E8B2BD"
          stroke="none"
        />
        <path d="M115 78q5 5 10 0" strokeWidth="2" />
        <circle cx="111" cy="67" r="2.2" fill="#2F4B68" stroke="none" />
        <circle cx="129" cy="67" r="2.2" fill="#2F4B68" stroke="none" />

        <g stroke="none">
          <circle cx="99" cy="112" r="6" fill="#C7B7E3" />
          <circle cx="88" cy="135" r="4.5" fill="#C7B7E3" />
          <circle cx="145" cy="111" r="4.5" fill="#A8C6DC" />
          <circle cx="148" cy="137" r="6" fill="#A8C6DC" />
          <circle cx="137" cy="155" r="3.5" fill="#A8C6DC" />
        </g>
        <path
          d="M102 143c-5-7-13-1-7 5l7 6 7-6c6-6-2-12-7-5Z"
          fill="#F1C3C8"
          strokeWidth="1.6"
        />
        <path
          d="M81 119c1-7 4-12 8-16m68 16c-1-7-4-12-8-16"
          stroke="#FFFFFF"
          strokeWidth="3"
          opacity=".7"
        />
      </g>

      <g stroke="#8CA9C0" strokeWidth="2" strokeLinecap="round">
        <path d="M184 54v8m-4-4h8" />
        <path d="m48 75-4-2m12-11-1-4" />
      </g>
      <circle cx="195" cy="83" r="2.5" fill="#D7C7EB" />
    </svg>
  );
}
