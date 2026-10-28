import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Viewer } from "../domain";
import { PreferenceSwitch } from "../ui";
import OverflowingCup from "./OverflowingCup";
import { FeedbackPreferences, useActionFeedback } from "../action-feedback";
import { parseContributionAmount } from "../donation-amount";
import type { ContributionAmount } from "../donation-amount";
import {
  buildFundingWindow,
  fundingContributionCap,
  fundingToday,
  monthlyFundingDates,
  validateFundingContribution,
  withFundingContribution,
} from "../funding-window";
import type { FundingInput, FundingWindow } from "../funding-window";
import "../donation-refinements.css";

type AccountPage = "donations" | "donation-history" | "settings";
type Privacy = "public" | "friends" | "private";
type AutomaticPreference = {
  fixture: "thanks" | "standing";
  status: "draft" | "pending" | "approved";
  enabled: boolean;
};
const defaultAutomaticPreference: AutomaticPreference = {
  fixture: "thanks",
  status: "draft",
  enabled: false,
};
type AccountPagesProps = {
  page: AccountPage;
  profilePictureControl?: ReactNode;
  onNavigate: (route: string) => void;
  onManageBlocked: () => void;
  onNotice: (message: string) => void;
  onPrivacyChange?: (privacy: Privacy) => void;
  onRemindersChange?: (enabled: boolean) => void;
  onAutomaticChange?: (
    enabled: boolean,
    scope?: "personal" | "grace",
    template?: string,
  ) => void;
  viewer?: Viewer;
  approvedMember?: boolean;
  organizationMemberships?: { name: string; username: string; admin: boolean }[];
  organizationName?: string;
  groupAdmin?: boolean;
  privacyValue?: Privacy;
  remindersValue?: boolean;
  countryPreference?: { country: string; show: boolean };
  onCountryPreferenceChange?: (value: {
    country: string;
    show: boolean;
  }) => void;
  associationVisibleValue?: boolean;
  onAssociationVisibleChange?: (show: boolean) => void;
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount,
  );
type ContributionFrequency = "one-time" | "monthly";
const AS_OF = "2026-10-27";
const records = [
  {
    date: "2026-10-20",
    reference: "DEMO-0028",
    type: "Monthly",
    amount: 10,
    refund: 0,
    status: "Paid",
  },
  {
    date: "2026-09-20",
    reference: "DEMO-0021",
    type: "Monthly",
    amount: 10,
    refund: 0,
    status: "Paid",
  },
  {
    date: "2026-08-20",
    reference: "DEMO-0016",
    type: "Monthly",
    amount: 10,
    refund: 10,
    status: "Refunded",
  },
  {
    date: "2026-07-20",
    reference: "DEMO-0012",
    type: "Monthly",
    amount: 10,
    refund: 0,
    status: "Failed",
  },
  {
    date: "2025-12-12",
    reference: "DEMO-0003",
    type: "One-time",
    amount: 15,
    refund: 0,
    status: "Paid",
  },
];

function AccountIcon({
  name,
  size = 20,
}: {
  name:
    | "heart"
    | "lock"
    | "arrow"
    | "download"
    | "check"
    | "close"
    | "note"
    | "shield";
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    download: <path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    note: (
      <>
        <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 3v6h6M8 13h8m-8 4h5" />
      </>
    ),
    shield: (
      <>
        <path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function AccountDialog({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`account-dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="account-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <AccountIcon name="close" />
        </button>
      </div>
      <div className="modal-feedback-slot" />
      {children}
    </dialog>
  );
}

function FundingMeter({ window }: { window: FundingWindow }) {
  const ratio =
    window.costCents === 0 ? 1 : 1 - window.remainingCents / window.costCents;
  const positiveCost = window.costCents > 0;
  const gradientId = useId().replaceAll(":", "");
  const goldId = `${gradientId}-gold`;
  const goldBevelId = `${gradientId}-gold-bevel`;
  const glintId = `${gradientId}-glint`;
  const rainbowMaskId = `${gradientId}-rainbow-mask`;
  const goldMaskId = `${gradientId}-gold-mask`;
  const meterRef = useRef<HTMLElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const meter = meterRef.current;
    const updateVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) =>
            setOnScreen(entry.isIntersecting),
          );
    if (meter && observer) observer.observe(meter);
    else setOnScreen(true);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);
  const angle = Math.PI * (1 - ratio);
  return (
    <figure
      ref={meterRef}
      className={`account-meter donation-meter${positiveCost ? "" : " account-meter-no-cost"}`}
      data-motion={onScreen && pageVisible ? "running" : "paused"}
      aria-label={
        positiveCost
          ? `Fictional three-month funding: ${money(window.receivedAppliedCents / 100)} received and ${money(window.expectedAppliedCents / 100)} expected toward ${money(window.costCents / 100)} of hosting need. ${money(window.remainingCents / 100)} remaining. Expected funds are not guaranteed.`
          : "No hosting costs in this three-month window. The full rainbow with a gold edge is decorative; no funding percentage applies."
      }
    >
      <div className="donation-meter-art">
        <svg
          className="account-meter-svg"
          viewBox="0 0 320 180"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id={gradientId}
              x1="0"
              y1="0"
              x2="320"
              y2="0"
              gradientUnits="userSpaceOnUse"
              spreadMethod="repeat"
            >
              <stop stopColor="#F23D5E" />
              <stop offset=".16" stopColor="#FF881F" />
              <stop offset=".32" stopColor="#FFD22F" />
              <stop offset=".49" stopColor="#27B76A" />
              <stop offset=".66" stopColor="#238FE8" />
              <stop offset=".83" stopColor="#9057E8" />
              <stop offset="1" stopColor="#F23D5E" />
            </linearGradient>
            <linearGradient
              id={goldId}
              x1="45"
              y1="22"
              x2="265"
              y2="154"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#82500D" />
              <stop offset=".12" stopColor="#E7B548" />
              <stop offset=".2" stopColor="#FFEDA6" />
              <stop offset=".225" stopColor="#FFFFEF" />
              <stop offset=".255" stopColor="#E0AE36" />
              <stop offset=".39" stopColor="#A46A13" />
              <stop offset=".48" stopColor="#F8D772" />
              <stop offset=".515" stopColor="#FFFEED" />
              <stop offset=".55" stopColor="#F3CC5F" />
              <stop offset=".7" stopColor="#A66C14" />
              <stop offset=".84" stopColor="#FFF0AC" />
              <stop offset="1" stopColor="#A36A12" />
            </linearGradient>
            <linearGradient
              id={goldBevelId}
              x1="0"
              y1="10"
              x2="0"
              y2="168"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#FFF8D0" />
              <stop offset=".18" stopColor="#B67A18" />
              <stop offset=".38" stopColor="#FFF4BE" />
              <stop offset=".5" stopColor="#976017" />
              <stop offset=".72" stopColor="#FFF9D8" />
              <stop offset="1" stopColor="#976017" />
            </linearGradient>
            <linearGradient id={glintId} x1="0" x2="1" y1="0" y2="0">
              <stop stopColor="#FFF8D9" stopOpacity="0" />
              <stop offset=".5" stopColor="#FFFFFF" stopOpacity=".95" />
              <stop offset="1" stopColor="#FFF8D9" stopOpacity="0" />
            </linearGradient>
            <mask
              id={rainbowMaskId}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="320"
              height="180"
            >
              <path
                d="M35 150A125 125 0 0 1 285 150"
                pathLength="100"
                fill="none"
                stroke="#fff"
                strokeWidth="20"
                strokeLinecap="round"
                strokeDasharray="100 100"
                strokeDashoffset={100 * (1 - ratio)}
              />
            </mask>
            <mask
              id={goldMaskId}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="320"
              height="180"
            >
              <path
                d="M35 150A125 125 0 0 1 285 150"
                fill="none"
                stroke="#fff"
                strokeWidth="33"
                strokeLinecap="round"
              />
              <path
                d="M35 150A125 125 0 0 1 285 150"
                fill="none"
                stroke="#000"
                strokeWidth="20"
                strokeLinecap="round"
              />
            </mask>
          </defs>
          <path
            d="M35 150A125 125 0 0 1 285 150"
            className="donation-meter-gold-edge"
            stroke={`url(#${goldBevelId})`}
          />
          <path
            d="M35 150A125 125 0 0 1 285 150"
            className="donation-meter-gold"
            stroke={`url(#${goldId})`}
          />
          <path
            d="M35 150A125 125 0 0 1 285 150"
            className="donation-meter-gold-bevel"
            stroke={`url(#${goldBevelId})`}
          />
          <path
            d="M35 150A125 125 0 0 1 285 150"
            className="donation-meter-gold-inner"
            stroke={`url(#${goldId})`}
          />
          <path
            d="M35 150A125 125 0 0 1 285 150"
            className="donation-meter-track"
          />
          <g mask={`url(#${rainbowMaskId})`}>
            <rect
              x="-320"
              y="0"
              width="960"
              height="180"
              fill={`url(#${gradientId})`}
              className="donation-meter-rainbow-drift donation-meter-motion-layer"
            />
          </g>
          <g mask={`url(#${goldMaskId})`}>
            <rect
              x="-95"
              y="0"
              width="80"
              height="180"
              fill={`url(#${glintId})`}
              className="donation-meter-gold-glint donation-meter-motion-layer"
            />
          </g>
          <g
            className="donation-meter-stars"
            fill="#F7CE59"
            stroke="#B87D16"
            strokeWidth=".65"
          >
            {[
              [40, 47, 1],
              [279, 51, 0.8],
              [160, 9, 0.7],
              [303, 114, 0.65],
              [17, 119, 0.55],
            ].map(([x, y, scale], index) => (
              <g key={index} transform={`translate(${x} ${y}) scale(${scale})`}>
                <path
                  d="M0-5 1.6-1.6 5 0 1.6 1.6 0 5-1.6 1.6-5 0-1.6-1.6Z"
                  className="donation-meter-star donation-meter-motion-layer"
                />
              </g>
            ))}
          </g>
          {positiveCost && ratio < 1 && (
            <circle
              cx={160 + 125 * Math.cos(angle)}
              cy={150 - 125 * Math.sin(angle)}
              r="5.5"
              fill="var(--ink)"
              stroke="var(--paper)"
              strokeWidth="2"
            />
          )}
        </svg>
        <div className="account-meter-center">
          <strong>{positiveCost ? `${Math.floor(ratio * 100)}%` : "$0"}</strong>
        </div>
      </div>
      <figcaption className="donation-meter-status">
        {positiveCost
          ? `${money(window.remainingCents / 100)} USD still needed`
          : "Our hosting cost has been met this month"}
      </figcaption>
    </figure>
  );
}

function CountryFlag({ country }: { country: string }) {
  if (country === "none") return null;
  return (
    <svg
      className="account-country-flag"
      viewBox="0 0 30 20"
      role="img"
      aria-label={
        country === "us"
          ? "United States flag"
          : country === "gb"
            ? "United Kingdom flag"
            : "Philippines flag"
      }
    >
      {country === "us" ? (
        <>
          <rect width="30" height="20" fill="#fff" />
          {[0, 3, 6, 9, 12, 15, 18].map((y) => (
            <rect key={y} y={y} width="30" height="1.6" fill="#B25D68" />
          ))}
          <rect width="13" height="11" fill="#485A87" />
          <path
            d="M2 2h1m3 0h1m3 0h1M2 5h1m3 0h1m3 0h1M2 8h1m3 0h1m3 0h1"
            stroke="#fff"
            strokeWidth="1.6"
          />
        </>
      ) : country === "gb" ? (
        <>
          <rect width="30" height="20" fill="#485A87" />
          <path d="m0 0 30 20M0 20 30 0" stroke="#fff" strokeWidth="5" />
          <path d="m0 0 30 20M0 20 30 0" stroke="#B25D68" strokeWidth="2" />
          <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="7" />
          <path d="M15 0v20M0 10h30" stroke="#B25D68" strokeWidth="4" />
        </>
      ) : (
        <>
          <rect width="30" height="10" fill="#485A87" />
          <rect y="10" width="30" height="10" fill="#B25D68" />
          <path d="M0 0v20l17-10Z" fill="#fff" />
          <circle cx="6" cy="10" r="2.5" fill="#CFA547" />
          <path
            d="m3 4 1 .5M3 16l1-.5m8-5 1-1"
            stroke="#CFA547"
            strokeWidth="1.5"
          />
        </>
      )}
    </svg>
  );
}

function csvCell(value: string | number) {
  const raw = String(value);
  // Controlled schema, plus neutralization for spreadsheet formula prefixes.
  const safe = /^[\s]*[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export default function AccountPages({
  page,
  profilePictureControl,
  onNavigate,
  onManageBlocked,
  onNotice,
  onPrivacyChange,
  onRemindersChange,
  onAutomaticChange,
  viewer = "elena",
  approvedMember = false,
  organizationMemberships = [],
  organizationName = "Grace Church",
  groupAdmin = false,
  privacyValue,
  remindersValue,
  countryPreference,
  onCountryPreferenceChange,
  associationVisibleValue,
  onAssociationVisibleChange,
}: AccountPagesProps) {
  const feedback = useActionFeedback();
  const [fundingScenario, setFundingScenario] = useState("zero");
  const [fundingAsOf] = useState(() => fundingToday());
  const [simulatedReceived, setSimulatedReceived] = useState(0);
  const [simulatedMonthly, setSimulatedMonthly] = useState(0);
  const fundingDates = monthlyFundingDates(fundingAsOf);
  const scenarioCost = fundingScenario === "zero" ? 0 : 10_000;
  const scenarioGross =
    fundingScenario === "partial"
      ? 6_500
      : fundingScenario === "covered"
        ? 10_500
        : 0;
  const scenarioFees =
    fundingScenario === "partial" || fundingScenario === "covered" ? 500 : 0;
  const scenarioRenewal =
    fundingScenario === "partial"
      ? 4_000
      : fundingScenario === "covered"
        ? 10_000
        : 0;
  const fundingInput: FundingInput = {
    asOf: fundingAsOf,
    costsCents: [scenarioCost, scenarioCost, scenarioCost],
    receivedGrossCents: scenarioGross + simulatedReceived,
    feesCents: scenarioFees,
    refundsCents: 0,
    expected: fundingDates.slice(1).flatMap((due, index) => [
      { id: `fixture-renewal-${index}`, due, cents: scenarioRenewal },
      { id: `personal-renewal-${index}`, due, cents: simulatedMonthly },
    ]),
  };
  const fundingWindow = buildFundingWindow(fundingInput);
  const [frequency, setFrequency] = useState<ContributionFrequency>("one-time");
  const [amountChoice, setAmountChoice] = useState<number | "custom">(10);
  const [customAmount, setCustomAmount] = useState("");
  const [amountError, setAmountError] = useState("");
  const amountId = useId();
  const customAmountField = useRef<HTMLInputElement>(null);
  const selectedAmount: ContributionAmount =
    amountChoice === "custom"
      ? parseContributionAmount(customAmount)
      : { cents: amountChoice * 100 };
  const contributionCap = fundingContributionCap(fundingInput, frequency);
  const monthlyHasNoRoom =
    !fundingWindow.locked && frequency === "monthly" && contributionCap === 0;
  const amount =
    selectedAmount.cents === undefined ? null : selectedAmount.cents / 100;
  const [contributionPreview, setContributionPreview] = useState<{
    cents: number;
    frequency: ContributionFrequency;
  } | null>(null);
  const [dialog, setDialog] = useState<
    "contribution" | "cancel" | "delete" | null
  >(null);
  const [planActive, setPlanActive] = useState(true);
  const [planAmount, setPlanAmount] = useState(10);
  const [planNextDay, setPlanNextDay] = useState(20);
  const [year, setYear] = useState("2026");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [localPrivacy, setPrivacy] = useState<Privacy>("private");
  const [localCountry, setCountry] = useState("none");
  const [localShowCountry, setShowCountry] = useState(false);
  const [localAssociationVisible, setAssociationVisible] = useState(false);
  const [localReminders, setReminders] = useState(true);
  const [contact, setContact] = useState<"none" | "email" | "phone" | "both">(
    "none",
  );
  const [emailPrayer, setEmailPrayer] = useState(false);
  const [smsPrayer, setSmsPrayer] = useState(false);
  const [incomingUpdates, setIncomingUpdates] = useState(true);
  const [outgoingUpdates, setOutgoingUpdates] = useState(true);
  const [automaticPreferences, setAutomaticPreferences] = useState<
    Partial<Record<Viewer, AutomaticPreference>>
  >({});
  const automaticPreference =
    automaticPreferences[viewer] ?? defaultAutomaticPreference;
  const automaticFixture = automaticPreference.fixture;
  const automaticStatus = automaticPreference.status;
  const automaticEnabled = automaticPreference.enabled;
  function updateAutomaticPreference(patch: Partial<AutomaticPreference>) {
    setAutomaticPreferences((previous) => ({
      ...previous,
      [viewer]: {
        ...(previous[viewer] ?? defaultAutomaticPreference),
        ...patch,
      },
    }));
  }
  const setAutomaticFixture = (fixture: AutomaticPreference["fixture"]) =>
    updateAutomaticPreference({ fixture });
  const setAutomaticStatus = (status: AutomaticPreference["status"]) =>
    updateAutomaticPreference({ status });
  const setAutomaticEnabled = (enabled: boolean) =>
    updateAutomaticPreference({ enabled });
  const [showRecovery, setShowRecovery] = useState(false);
  function reviewContribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    feedback.prepare();
    if (selectedAmount.cents === undefined) {
      setAmountError(selectedAmount.error);
      customAmountField.current?.focus();
      feedback.respond({
        tone: "error",
        title: "Please check your contribution amount.",
        message: selectedAmount.error,
      });
      return;
    }
    const fundingError = validateFundingContribution(
      fundingInput,
      selectedAmount.cents,
      frequency,
    );
    if (fundingError) {
      setAmountError(fundingError);
      customAmountField.current?.focus();
      feedback.respond({
        tone: "error",
        title: "Please check the remaining need.",
        message: fundingError,
      });
      return;
    }
    setAmountError("");
    setContributionPreview({ cents: selectedAmount.cents, frequency });
    setDialog("contribution");
  }
  const privacy = privacyValue ?? localPrivacy;
  const reminders = remindersValue ?? localReminders;
  const country = countryPreference?.country ?? localCountry;
  const showCountry = countryPreference?.show ?? localShowCountry;
  const associationVisible = associationVisibleValue ?? localAssociationVisible;
  const emailAvailable = contact === "email" || contact === "both";
  const phoneAvailable = contact === "phone" || contact === "both";
  const ownedAutomaticBox: "personal" | "grace" =
    groupAdmin ? "grace" : "personal";
  const template =
    automaticFixture === "thanks"
      ? `Thank you for trusting ${ownedAutomaticBox === "personal" ? "me" : organizationName} with your prayer request. Your request has reached ${ownedAutomaticBox === "personal" ? "my" : "our"} prayer box. May you find comfort and strength in Jesus. You’re welcome to return here to share an update.`
      : "Thank you for sharing your prayer request. I make time to pray for those who leave a request in my box. You are welcome to return with an update, even while you are still waiting.";
  const filteredRecords = records.filter(
    (record) =>
      record.date.startsWith(year) &&
      (!dateFrom || record.date >= dateFrom) &&
      (!dateTo || record.date <= dateTo),
  );
  const paid = filteredRecords
    .filter((record) => record.status !== "Failed")
    .reduce((sum, record) => sum + record.amount, 0);
  const refunds = filteredRecords.reduce(
    (sum, record) => sum + record.refund,
    0,
  );
  const rangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  function exportCsv() {
    feedback.prepare();
    let exportUrl: string | undefined;
    try {
      const rows: (string | number)[][] = [
        ["Contribution history — fictional examples, for your records"],
        [
          "Issuer",
          "Prayer Box prototype — entity and tax eligibility not verified",
        ],
        ["As of", AS_OF, "Currency", "USD"],
        [
          "Date",
          "Private reference",
          "Frequency",
          "Status",
          "Gross paid USD",
          "Refund USD",
          "Net USD",
        ],
        ...filteredRecords.map((record) => [
          record.date,
          record.reference,
          record.type,
          record.status,
          record.status === "Failed" ? "0.00" : record.amount.toFixed(2),
          record.refund.toFixed(2),
          (record.status === "Failed"
            ? 0
            : record.amount - record.refund
          ).toFixed(2),
        ]),
        [
          "Totals",
          "",
          "",
          "",
          paid.toFixed(2),
          refunds.toFixed(2),
          (paid - refunds).toFixed(2),
        ],
        [
          "Not a tax receipt. No real payments were made. Pending/failed payments and future renewals are excluded.",
        ],
      ];
      const blob = new Blob(
        ["\uFEFF", rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8;" },
      );
      const url = URL.createObjectURL(blob);
      exportUrl = url;
      const link = document.createElement("a");
      link.href = url;
      link.download = `Prayer-Box-fictional-contributions-${year}.csv`;
      link.click();
      onNotice(
        "Fictional contribution history exported as CSV. This is a personal record, not a tax receipt.",
      );
      feedback.respond({
        tone: "success",
        title: "Your fictional contribution record is ready.",
        message:
          "The CSV was prepared for download. These are demo records, not a tax receipt.",
      });
    } catch {
      onNotice(
        "This browser could not prepare the fictional CSV. Your example records are still available.",
      );
      feedback.respond({
        tone: "error",
        title: "Your demo record could not be prepared.",
        message:
          "No file is confirmed. Your example records are still here; you can try again.",
      });
    } finally {
      if (exportUrl) {
        const url = exportUrl;
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
  }

  function updateAutomaticDraft() {
    setAutomaticStatus("draft");
    setAutomaticEnabled(false);
    onAutomaticChange?.(false, ownedAutomaticBox, template);
  }

  if (viewer === "guest" && page !== "donations")
    return (
      <div className="account-page">
        <header className="account-page-heading">
          <p className="eyebrow">A private corner</p>
          <h1 className="page-title">For your eyes only.</h1>
          <p className="page-intro">
            Choose a signed-in fictional viewer from the demo controls to
            explore private settings and contribution records.
          </p>
        </header>
        <section className="panel account-settings-section">
          <AccountIcon name="lock" size={28} />
          <h2>No private records shown</h2>
          <p>
            Public visitors cannot browse another person’s settings or donation
            history. This is a frontend access-state example, not working
            authentication.
          </p>
          <button
            className="button secondary"
            onClick={() => onNavigate("my-box")}
          >
            Back to the box
          </button>
        </section>
      </div>
    );

  if (page === "donation-history" && viewer !== "elena")
    return (
      <div className="account-page">
        <header className="account-page-heading">
          <p className="eyebrow">
            <AccountIcon name="lock" size={14} /> Only you
          </p>
          <h1 className="page-title">My donations</h1>
          <p className="page-intro">
            No contribution records belong to this fictional viewer.
          </p>
        </header>
        <section className="panel account-settings-section">
          <AccountIcon name="note" size={28} />
          <h2>A quiet history, for now.</h2>
          <p>
            The example payment records and monthly plan belong only to Elena’s
            fixture. Another viewer cannot open, print or export them.
          </p>
          <button
            className="button secondary"
            onClick={() => onNavigate("donations")}
          >
            View hosting information <AccountIcon name="arrow" size={17} />
          </button>
        </section>
      </div>
    );

  return (
    <div className={`account-page account-page-${page}`}>
      {page === "donations" ? (
        <>
          <header className="account-page-heading">
            <p className="eyebrow">A small, shared space</p>
            <h1 className="page-title">Keeping the box open.</h1>
            <p className="page-intro">
              A quiet look at what it takes to keep Prayer Box running. Asking
              for prayer is always free.
            </p>
          </header>
          <div className="account-donation-layout">
            <section
              className="account-funding panel"
              aria-labelledby="account-funding-title"
            >
              <div className="account-section-top">
                <div>
                  <span className="account-kicker">
                    Three months, thoughtfully covered
                  </span>
                  <h2 id="account-funding-title">
                    {fundingWindow.months[0].key.slice(0, 4) ===
                    fundingWindow.months[2].key.slice(0, 4)
                      ? fundingWindow.months[0].label.split(" ")[0]
                      : fundingWindow.months[0].label}
                    –{fundingWindow.months[2].label} <span>· USD</span>
                  </h2>
                </div>
                <span className="account-soft-icon">
                  <AccountIcon name="heart" size={25} />
                </span>
              </div>
              <FundingMeter window={fundingWindow} />
              <p className="account-funding-caption">
                {fundingWindow.locked
                  ? "A little space, with room to keep praying."
                  : "A little help goes a long way."}
              </p>
              <div
                className="donation-months"
                aria-label="Rolling three-month hosting plan"
              >
                {fundingWindow.months.map((month) => (
                  <article
                    key={month.key}
                    className={month.remainingCents === 0 ? "is-covered" : ""}
                  >
                    <h3>{month.label}</h3>
                    <p>
                      <strong>{money(month.costCents / 100)}</strong> hosting
                      need
                    </p>
                    <dl>
                      <div>
                        <dt>Received</dt>
                        <dd>{money(month.receivedCents / 100)}</dd>
                      </div>
                      <div>
                        <dt>Expected</dt>
                        <dd>{money(month.expectedCents / 100)}</dd>
                      </div>
                      <div>
                        <dt>Still needed</dt>
                        <dd>{money(month.remainingCents / 100)}</dd>
                      </div>
                    </dl>
                    <span className="donation-month-status">
                      {month.costCents === 0
                        ? "No hosting cost"
                        : month.remainingCents === 0
                          ? month.expectedCents > 0
                            ? "Covered with expected funds"
                            : "Covered by received funds"
                          : "Room to help"}
                    </span>
                  </article>
                ))}
              </div>
              <dl className="account-funding-lines">
                <div>
                  <dt>Three-month hosting need</dt>
                  <dd>{money(fundingWindow.costCents / 100)}</dd>
                </div>
                <div>
                  <dt>Received · gross</dt>
                  <dd>{money(fundingInput.receivedGrossCents / 100)}</dd>
                </div>
                <div>
                  <dt>Processing fees / refunds</dt>
                  <dd>
                    {money(fundingInput.feesCents / 100)} / {money(0)}
                  </dd>
                </div>
                <div>
                  <dt>Received · net available</dt>
                  <dd>{money(fundingWindow.receivedNetCents / 100)}</dd>
                </div>
                <div>
                  <dt>Expected renewals applied</dt>
                  <dd>{money(fundingWindow.expectedAppliedCents / 100)}</dd>
                </div>
                <div className="account-total-line">
                  <dt>Remaining three-month need</dt>
                  <dd>{money(fundingWindow.remainingCents / 100)}</dd>
                </div>
              </dl>
              <p className="account-small">
                Planning date {fundingAsOf} · USD. The window rolls to the
                current month and the following two months. Received funds are
                net of fees and refunds. Expected renewals are separate,
                uncollected commitments, not guaranteed income; failed or
                canceled renewals reopen the need. Future renewals cannot cover
                an earlier month. Renewal estimates in these fictional scenarios
                assume no additional fees or refunds; real net estimates would
                need reconciliation.
              </p>
              <label className="field donation-scenario-control">
                Funding preview
                <select
                  value={fundingScenario}
                  onChange={(event) => {
                    setFundingScenario(event.target.value);
                    setSimulatedReceived(0);
                    setSimulatedMonthly(0);
                    setAmountError("");
                  }}
                >
                  <option value="zero">Initial need · $0 hosting costs</option>
                  <option value="open">
                    Fictional · $100 needed each month
                  </option>
                  <option value="partial">
                    Fictional · received + expected, need remains
                  </option>
                  <option value="covered">
                    Fictional · covered by received + expected
                  </option>
                </select>
              </label>
              <p className="account-small">
                Only the initial $0 need reflects the founder’s stated cost.
                Other costs, received amounts, and renewal commitments are
                clearly fictional scenarios. Simulations reset when the scenario
                changes.
              </p>
            </section>
            <div className="account-donation-side">
              <section
                className="account-contribute panel"
                aria-labelledby="account-contribute-title"
              >
                {fundingWindow.locked ? (
                  <div className="donation-lock-message" role="status">
                    <svg
                      className="donation-drawn-lock"
                      viewBox="0 0 180 160"
                      aria-hidden="true"
                    >
                      <ellipse cx="90" cy="143" rx="55" ry="8" fill="#dce2e8" />
                      <path
                        d="M57 70V48C57 9 121 10 123 48V70"
                        fill="none"
                        stroke="#617188"
                        strokeWidth="15"
                        strokeLinecap="round"
                      />
                      <path
                        d="M59 69V47C59 15 116 16 118 48V68"
                        fill="none"
                        stroke="#f2f5f7"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      <path
                        d="M43 63Q90 58 136 65L141 127Q90 145 39 128Z"
                        fill="#e4c985"
                        stroke="#9d7d42"
                        strokeWidth="3"
                        strokeLinejoin="round"
                      />
                      <path
                        d="m48 71 80-1M47 79l1 40"
                        fill="none"
                        stroke="#fff5cb"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      <path
                        d="M95 90c9 0 12 13 3 17l3 13H85l3-13c-8-5-4-17 7-17Z"
                        fill="#807052"
                      />
                      <path
                        d="m24 45 3 7 7 3-7 3-3 7-3-7-7-3 7-3ZM151 82l2 5 6 2-6 2-2 6-2-6-5-2 5-2Z"
                        fill="#c5b0e6"
                      />
                    </svg>
                    <p className="eyebrow">Enough for this little space</p>
                    <div className="donation-overflow-heading">
                      <OverflowingCup />
                      <h2 id="account-contribute-title">Our cup is overflowing!</h2>
                    </div>
                    <p>
                      The next three months’ hosting need has been met, so
                      donations are disabled for now. Contributions can reopen
                      when that rolling three-month need is no longer covered.
                    </p>
                    {fundingWindow.expectedAppliedCents > 0 && (
                      <p className="account-small">
                        Some coverage is expected from recurring commitments.
                        Those funds have not been received; a failed or canceled
                        renewal may reopen donations.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="eyebrow">An optional contribution</p>
                    <h2 id="account-contribute-title">Made with care.</h2>
                    <p>
                      Try the contribution flow within the remaining need. No
                      money will be collected.
                    </p>
                  </>
                )}
                <form
                  className="donation-contribution-form"
                  noValidate
                  onSubmit={reviewContribution}
                >
                  <fieldset
                    className="donation-form-fields"
                    disabled={fundingWindow.locked}
                  >
                    <legend className="account-sr-only">
                      Contribution preview controls
                    </legend>
                    <fieldset className="account-segment-field">
                      <legend className="account-sr-only">
                        Contribution frequency
                      </legend>
                      <div
                        className="account-segments"
                        data-selection={frequency}
                      >
                        <span
                          className="account-segment-indicator"
                          aria-hidden="true"
                        />
                        {(["one-time", "monthly"] as const).map((value) => (
                          <label
                            key={value}
                            className={frequency === value ? "is-selected" : ""}
                          >
                            <input
                              type="radio"
                              name="contribution-frequency"
                              value={value}
                              checked={frequency === value}
                              onChange={() => {
                                setFrequency(value);
                                setAmountError("");
                              }}
                            />
                            <span>
                              {value === "one-time" ? "One-time" : "Monthly"}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset className="account-amount-field">
                      <legend>Example amount · USD</legend>
                      <div className="account-amounts">
                        {[5, 10, 25].map((value) => (
                          <label
                            key={value}
                            className={
                              amountChoice === value ? "is-selected" : ""
                            }
                          >
                            <input
                              type="radio"
                              name="contribution-amount"
                              checked={amountChoice === value}
                              disabled={value * 100 > contributionCap}
                              onChange={() => {
                                setAmountChoice(value);
                                setAmountError("");
                              }}
                            />
                            <span>${value}</span>
                          </label>
                        ))}
                        <label
                          className={`donation-custom-choice${amountChoice === "custom" ? " is-selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name="contribution-amount"
                            checked={amountChoice === "custom"}
                            onChange={() => {
                              setAmountChoice("custom");
                              setAmountError("");
                            }}
                          />
                          <span>Custom</span>
                        </label>
                      </div>
                      {amountChoice === "custom" && (
                        <div className="donation-custom-amount">
                          <label
                            className="field"
                            htmlFor={`${amountId}-custom`}
                          >
                            Custom amount · USD
                          </label>
                          <div className="donation-custom-input">
                            <span aria-hidden="true">$</span>
                            <input
                              ref={customAmountField}
                              id={`${amountId}-custom`}
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              required
                              value={customAmount}
                              placeholder="12.50"
                              aria-invalid={!!amountError}
                              aria-describedby={`${amountId}-amount-help${amountError ? ` ${amountId}-amount-error` : ""}`}
                              onChange={(event) => {
                                setCustomAmount(event.target.value);
                                setAmountError("");
                              }}
                            />
                          </div>
                          <p
                            className="account-small"
                            id={`${amountId}-amount-help`}
                          >
                            {contributionCap > 0
                              ? `Up to ${money(contributionCap / 100)} USD${frequency === "monthly" ? " per month" : " once"}; minimum $0.01, up to two decimal places.`
                              : fundingWindow.locked
                                ? "No contribution can be previewed while this need is covered."
                                : `There is still ${money(fundingWindow.remainingCents / 100)} USD to cover, but three equal monthly payments will not fit. Choose One-time to help with the remaining need.`}
                          </p>
                        </div>
                      )}
                    </fieldset>
                    {amountError && (
                      <p
                        className="donation-amount-error"
                        role="alert"
                        id={`${amountId}-amount-error`}
                      >
                        {amountError}
                      </p>
                    )}
                    <p className="donation-cap-note">
                      {monthlyHasNoRoom
                        ? `The remaining ${money(fundingWindow.remainingCents / 100)} USD can be covered with one-time support. There is no room for three equal monthly payments.`
                        : frequency === "monthly"
                          ? `Three equal payments: today, ${fundingDates[1]}, and ${fundingDates[2]}. The current cap is ${money(contributionCap / 100)} USD per payment.`
                          : `Current one-time cap: ${money(contributionCap / 100)} USD.`}
                    </p>
                    <p className="account-frequency-note">
                      {monthlyHasNoRoom
                        ? "Choose One-time above or below to preview a contribution within the remaining need."
                        : amount === null
                          ? `Enter your custom USD amount to preview a ${frequency === "monthly" ? "monthly contribution" : "one-time contribution"}.`
                          : frequency === "monthly"
                            ? `${money(amount)} USD every month. Review billing dates and cancellation before simulating.`
                            : `${money(amount)} USD once. No recurring contribution.`}
                    </p>
                    {monthlyHasNoRoom && (
                      <button
                        type="button"
                        className="button secondary account-wide-button donation-switch-once"
                        onClick={() => {
                          setFrequency("one-time");
                          setAmountChoice("custom");
                          setCustomAmount(
                            (
                              fundingContributionCap(fundingInput, "one-time") /
                              100
                            ).toFixed(2),
                          );
                          setAmountError("");
                          requestAnimationFrame(() =>
                            customAmountField.current?.focus(),
                          );
                        }}
                      >
                        Choose one-time support{" "}
                        <AccountIcon name="arrow" size={19} />
                      </button>
                    )}
                    <button
                      type="submit"
                      className="button account-wide-button"
                      disabled={contributionCap === 0}
                    >
                      {fundingWindow.locked
                        ? "Donations are resting for now"
                        : monthlyHasNoRoom
                          ? "Monthly preview unavailable"
                          : "Preview contribution"}{" "}
                      <AccountIcon
                        name={fundingWindow.locked ? "lock" : "arrow"}
                        size={19}
                      />
                    </button>
                  </fieldset>
                </form>
                <p className="account-small">
                  Preview only. No real payment, subscription, or tax receipt is
                  created. Real charges would be rechecked against the remaining
                  need before every renewal and paused or reduced when covered,
                  with clear consent before any later increase. Provider,
                  receiving entity, and final billing rules still require
                  approval.
                </p>
              </section>
              <p className="account-donation-footnote">
                <AccountIcon name="lock" size={18} />
                <span>
                  Public contributions would be labeled “Anonymous.” Necessary
                  payment and private account records may still identify a
                  payer. No donor names or totals appear on profiles.
                </span>
              </p>
            </div>
          </div>
          <section className="account-donation-bottom">
            <div>
              <h2>Simple and transparent.</h2>
              <p>
                Contributions support the site’s actual operating needs. They
                never change access to prayer or community care.
              </p>
            </div>
            <button
              className="text-link"
              onClick={() => onNavigate("donation-history")}
            >
              My private donation history <AccountIcon name="arrow" size={17} />
            </button>
          </section>
        </>
      ) : null}

      {page === "donation-history" ? (
        <>
          <header className="account-page-heading">
            <p className="eyebrow">
              <AccountIcon name="lock" size={14} /> Only you
            </p>
            <h1 className="page-title">My donations</h1>
            <p className="page-intro">
              Your contributions, all in one quiet place. These private examples
              never appear on your public profile.
            </p>
          </header>
          <div className="account-history-layout">
            <section
              className="account-history-records panel"
              aria-labelledby="account-records-title"
            >
              <div className="account-section-top">
                <h2 id="account-records-title">Contribution history</h2>
                <span className="account-pill">Fictional records</span>
              </div>
              <div className="account-history-filters">
                <label className="field">
                  Year
                  <select
                    value={year}
                    onChange={(event) => {
                      setYear(event.target.value);
                      setDateFrom("");
                      setDateTo("");
                    }}
                  >
                    <option>2026</option>
                    <option>2025</option>
                  </select>
                </label>
                <label className="field">
                  From
                  <input
                    type="date"
                    value={dateFrom}
                    min={`${year}-01-01`}
                    max={`${year}-12-31`}
                    onChange={(event) => setDateFrom(event.target.value)}
                  />
                </label>
                <label className="field">
                  To
                  <input
                    type="date"
                    value={dateTo}
                    min={`${year}-01-01`}
                    max={`${year}-12-31`}
                    onChange={(event) => setDateTo(event.target.value)}
                  />
                </label>
              </div>
              {rangeInvalid ? (
                <p className="account-inline-error" role="alert">
                  Choose an end date on or after the start date.
                </p>
              ) : null}
              <div className="account-history-summary">
                <span>
                  Net recorded contributions{" "}
                  <small>{year} · USD · excludes failed payments</small>
                </span>
                <strong>{money(paid - refunds)}</strong>
              </div>
              <div className="account-table-wrap">
                <table className="account-history-table">
                  <caption className="account-sr-only">
                    Fictional contribution records for {year}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Contribution</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((record) => (
                      <tr key={record.reference}>
                        <td>
                          <strong>
                            {new Date(
                              `${record.date}T12:00:00`,
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </strong>
                          <span>
                            {record.type} · {record.reference}
                          </span>
                        </td>
                        <td>
                          {money(record.amount)}
                          <span>
                            {record.refund
                              ? `${money(record.refund)} refunded`
                              : record.status === "Failed"
                                ? "Not charged"
                                : "USD"}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`account-status account-status-${record.status.toLowerCase()}`}
                          >
                            {record.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRecords.length === 0 ? (
                  <div className="account-empty-records">
                    <AccountIcon name="note" size={28} />
                    <h3>No example records in this range</h3>
                    <p>Try another year or clear the date filters.</p>
                  </div>
                ) : null}
              </div>
              <div className="account-export-actions">
                <button
                  className="button secondary"
                  onClick={exportCsv}
                  disabled={rangeInvalid}
                >
                  <AccountIcon name="download" size={17} /> Export CSV
                </button>
                <button
                  className="button secondary"
                  disabled={rangeInvalid}
                  onClick={() => window.print()}
                >
                  <AccountIcon name="note" size={17} /> Print / save PDF
                </button>
              </div>
              <p className="account-small">
                Exports contain only these fictional records. “Print / save PDF”
                opens your browser’s print dialog; choose Save as PDF.
              </p>
            </section>
            <aside className="account-history-side">
              <section className="account-monthly-card panel">
                <span className="account-soft-icon">
                  <AccountIcon name="heart" />
                </span>
                <p className="eyebrow">Example monthly plan</p>
                <h2>
                  {planActive
                    ? `${money(planAmount)} a month`
                    : "Monthly plan canceled"}
                </h2>
                {planActive ? (
                  <>
                    <span className="account-status account-status-paid">
                      Active · simulation
                    </span>
                    <p>
                      Next example billing date
                      <br />
                      <strong>
                        {fundingWindow.months[1].label.split(" ")[0]}{" "}
                        {planNextDay},{" "}
                        {fundingWindow.months[1].label.split(" ")[1]} · USD
                      </strong>
                    </p>
                    <button
                      className="text-link"
                      onClick={() => setDialog("cancel")}
                    >
                      Cancel monthly donation
                    </button>
                  </>
                ) : (
                  <>
                    <p>
                      No future example renewals. Your existing records remain
                      available.
                    </p>
                    <button
                      className="text-link"
                      onClick={() => {
                        feedback.prepare();
                        setPlanActive(true);
                        setPlanAmount(10);
                        setPlanNextDay(20);
                        onNotice(
                          "The fictional monthly plan was reset. No subscription was created.",
                        );
                        feedback.respond({
                          tone: "info",
                          title: "Your example monthly plan is reset.",
                          message:
                            "No real subscription was created or changed.",
                        });
                      }}
                    >
                      Reset example plan
                    </button>
                  </>
                )}
                <p className="account-small">
                  No real subscription or payment exists. Plan management
                  remains accessible if posting is restricted.
                </p>
              </section>
              <section className="account-tax-note">
                <h2>For your records.</h2>
                <p>
                  These are contribution records, not a tax receipt. Prayer
                  Box’s receiving entity and tax eligibility have not been
                  verified. An export does not establish tax deductibility.
                </p>
                <p>
                  Paid examples: {money(paid)}
                  <br />
                  Refunds: {money(refunds)}
                  <br />
                  Net: {money(paid - refunds)}
                </p>
              </section>
            </aside>
          </div>
          <section className="account-print-statement" aria-hidden="true">
            <h1>Contribution history — for your records</h1>
            <p>
              Prayer Box frontend prototype · fictional records only
              <br />
              Issuer entity and tax eligibility not verified · As of {AS_OF}
              <br />
              Account: signed-in fictional viewer · {year} · Currency: USD
            </p>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Paid</th>
                  <th>Refund</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.reference}>
                    <td>{record.date}</td>
                    <td>{record.reference}</td>
                    <td>{record.type}</td>
                    <td>{record.status}</td>
                    <td>
                      {money(record.status === "Failed" ? 0 : record.amount)}
                    </td>
                    <td>{money(record.refund)}</td>
                    <td>
                      {money(
                        record.status === "Failed"
                          ? 0
                          : record.amount - record.refund,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Gross paid: {money(paid)} · Refunds: {money(refunds)} · Net
              recorded: {money(paid - refunds)}
            </p>
            <p>
              Failed payments and future renewals are excluded from paid totals.
              No real payments were made. This document is not a tax receipt and
              makes no claim of charitable deductibility.
            </p>
          </section>
        </>
      ) : null}

      {page === "settings" ? (
        <>
          <header className="account-page-heading">
            <p className="eyebrow">Your little corner</p>
            <h1 className="page-title">Settings</h1>
            <p className="page-intro">
              Make your box feel right for you. All changes here are temporary
              prototype preferences.
            </p>
            <button className="button secondary" onClick={() => onNavigate('church')}>Your prayer groups and friends</button>
          </header>
          <div className="account-settings-layout">
            <div className="account-settings-main">
              {profilePictureControl}
              <FeedbackPreferences />
              {organizationMemberships.map(group => (
                <section className="account-settings-section panel" key={group.username}>
                  <h2>{group.name}</h2>
                  <p>{group.admin ? 'Manage your group name, picture, website, and members together.' : 'View your group and manage your membership.'}</p>
                  <button className="button secondary" onClick={() => onNavigate(`group/${group.username}`)}>{group.admin ? 'Manage prayer group' : 'View prayer group'}</button>
                </section>
              ))}
              <section className="account-settings-section panel">
                <div className="account-section-top">
                  <h2>Your profile & privacy</h2>
                  <AccountIcon name="lock" />
                </div>
                <p>
                  Your account’s visibility sets an outer limit. A private
                  prayer stays private when your profile changes.
                </p>
                <label className="field">
                  Account visibility
                  <select
                    value={privacy}
                    onChange={(event) => {
                      const next = event.target.value as Privacy;
                      setPrivacy(next);
                      onPrivacyChange?.(next);
                    }}
                  >
                    <option value="private">
                      Private · no profile content for outsiders
                    </option>
                    <option value="friends">
                      My Church · accepted friends only
                    </option>
                    <option value="public">Everyone · public profile</option>
                  </select>
                </label>
                <p className="account-field-help">
                  Chosen recipients still receive their separate delivery.
                  Public sharing never overrides a private request or box.
                </p>
                <div className="account-country-row">
                  <label className="field">
                    Country / region{" "}
                    <span className="account-optional">Optional</span>
                    <select
                      value={country}
                      onChange={(event) => {
                        const nextCountry = event.target.value;
                        const nextShow =
                          nextCountry === "none" ? false : showCountry;
                        setCountry(nextCountry);
                        setShowCountry(nextShow);
                        onCountryPreferenceChange?.({
                          country: nextCountry,
                          show: nextShow,
                        });
                      }}
                    >
                      <option value="none">Prefer not to say</option>
                      <option value="us">United States</option>
                      <option value="gb">United Kingdom</option>
                      <option value="ph">Philippines</option>
                    </select>
                  </label>
                  <CountryFlag country={country} />
                </div>
                <label className="account-checkbox-row account-switch-row">
                  <PreferenceSwitch
                    checked={showCountry}
                    disabled={country === "none"}
                    onChange={(checked) => {
                      setShowCountry(checked);
                      onCountryPreferenceChange?.({
                        country,
                        show: checked,
                      });
                    }}
                  />
                  <span>
                    Show my country beside my name
                    <small>
                      Only where your identity and profile are permitted. Never
                      on anonymous content or donation records.
                    </small>
                  </span>
                </label>
                <p className="account-field-help">
                  Self-selected; never inferred from your location. You can
                  remove it anytime.
                </p>
              </section>

              <details className="account-settings-section panel">
                <summary>
                  My associations
                  <span>Membership and public display are separate</span>
                </summary>
                <div className="account-details-body">
                  {approvedMember ? (
                    <>
                      <div className="account-association">
                        <span className="account-association-mark">{organizationName.slice(0, 1)}</span>
                        <div>
                          <strong>{organizationName}</strong>
                          <span>
                            Approved by {organizationName} ·{" "}
                            {groupAdmin
                              ? "admin"
                              : "member / prayer warrior"}{" "}
                            in this demo
                          </span>
                        </div>
                      </div>
                      <label className="account-checkbox-row account-switch-row">
                        <PreferenceSwitch
                          checked={associationVisible}
                          onChange={(checked) => {
                            setAssociationVisible(checked);
                            onAssociationVisibleChange?.(checked);
                          }}
                        />
                        <span>
                          Display this association on my profile
                          <small>
                            Hidden by default. Hiding it does not remove your
                            approved inbox access.
                          </small>
                        </span>
                      </label>
                    </>
                  ) : (
                    <>
                      <p>
                        You are not currently an approved member of {organizationName}.
                        A request to join, invitation or typed affiliation does
                        not create approved membership.
                      </p>
                      <button
                        className="text-link"
                        onClick={() => onNavigate("box/grace")}
                      >
                        Visit Grace Church’s public box{" "}
                        <AccountIcon name="arrow" size={16} />
                      </button>
                    </>
                  )}
                  <p className="account-small">
                    Church approval is not a platform guarantee of identity or
                    safety. My Church keeps your organizations and your private
                    list of accepted friends separate.
                  </p>
                </div>
              </details>

              <details className="account-settings-section panel">
                <summary>
                  Recovery & contact options
                  <span>No email or phone required</span>
                </summary>
                <div className="account-details-body">
                  <p>
                    Username-only accounts need recovery codes when there is no
                    verified contact. No email reset is promised without an
                    email.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => setShowRecovery((value) => !value)}
                  >
                    {showRecovery
                      ? "Hide example recovery codes"
                      : "Preview example recovery codes"}
                  </button>
                  {showRecovery ? (
                    <div className="account-recovery-codes">
                      <strong>DEMO ONLY · not valid for signing in</strong>
                      <code>
                        DEMO-LAVENDER-01
                        <br />
                        DEMO-PRAYER-NOTE-02
                        <br />
                        DEMO-PEACH-BOX-03
                      </code>
                      <p>
                        No password or real recovery information is collected.
                      </p>
                    </div>
                  ) : null}
                  <label className="field">
                    Preview verified contact availability
                    <select
                      value={contact}
                      onChange={(event) => {
                        const next = event.target.value as typeof contact;
                        setContact(next);
                        if (next !== "email" && next !== "both")
                          setEmailPrayer(false);
                        if (next !== "phone" && next !== "both")
                          setSmsPrayer(false);
                      }}
                    >
                      <option value="none">No contact · in-app only</option>
                      <option value="email">
                        Fictional verified email available
                      </option>
                      <option value="phone">
                        Fictional verified phone available
                      </option>
                      <option value="both">
                        Fictional verified email & phone available
                      </option>
                    </select>
                  </label>
                  <p className="account-field-help">
                    This changes a demo fixture. It does not enter, verify or
                    send to a real address or phone.
                  </p>
                </div>
              </details>

              <details className="account-settings-section panel">
                <summary>
                  Notifications & consent
                  <span>In-app updates work without contact details</span>
                </summary>
                <div className="account-details-body">
                  <p>
                    Each contact purpose is its own choice. Verification and
                    church membership never opt you in.
                  </p>
                  <label className="account-checkbox-row">
                    <input
                      type="checkbox"
                      checked={emailPrayer}
                      disabled={!emailAvailable}
                      onChange={(event) => setEmailPrayer(event.target.checked)}
                    />
                    <span>
                      Email prayer updates
                      <small>
                        {!emailAvailable
                          ? "Select a fictional verified email in Recovery & contact options to preview."
                          : "Optional notices about incoming and sent requests. No sensitive prayer text in previews."}
                      </small>
                    </span>
                  </label>
                  <label className="account-checkbox-row">
                    <input
                      type="checkbox"
                      checked={smsPrayer}
                      disabled={!phoneAvailable}
                      onChange={(event) => setSmsPrayer(event.target.checked)}
                    />
                    <span>
                      SMS prayer updates
                      <small>
                        {!phoneAvailable
                          ? "Select a fictional verified phone in Recovery & contact options to preview."
                          : "Optional prayer updates. Unsubscribe or SMS STOP must be honored in production."}
                      </small>
                    </span>
                  </label>
                  <label className="account-checkbox-row">
                    <input type="checkbox" checked={false} disabled />
                    <span>
                      Email marketing
                      <small>
                        Inactive · requires separate founder approval.
                      </small>
                    </span>
                  </label>
                  <label className="account-checkbox-row">
                    <input type="checkbox" checked={false} disabled />
                    <span>
                      SMS marketing
                      <small>
                        Inactive · requires separate founder approval.
                      </small>
                    </span>
                  </label>
                  <div className="account-setting-divider" />
                  <p className="account-preference-heading">
                    Which prayer updates?
                  </p>
                  <label className="account-checkbox-row account-switch-row">
                    <PreferenceSwitch
                      checked={incomingUpdates}
                      onChange={setIncomingUpdates}
                    />
                    <span>
                      Incoming box updates
                      <small>
                        Requests, encouragement and linked updates sent to your
                        box.
                      </small>
                    </span>
                  </label>
                  <label className="account-checkbox-row account-switch-row">
                    <PreferenceSwitch
                      checked={outgoingUpdates}
                      onChange={setOutgoingUpdates}
                    />
                    <span>
                      Updates to my sent requests
                      <small>
                        Replies, testimonies and review outcomes. Contact
                        notices still require the separate channel opt-in above.
                      </small>
                    </span>
                  </label>
                  <div className="account-setting-divider" />
                  <label className="account-checkbox-row account-switch-row">
                    <PreferenceSwitch
                      checked={reminders}
                      onChange={(checked) => {
                        setReminders(checked);
                        onRemindersChange?.(checked);
                      }}
                    />
                    <span>
                      Gentle reminders to pray together
                      <small>
                        Once per eligible request from an identified, accepted
                        friend. Always ask before meeting or laying on hands.
                      </small>
                    </span>
                  </label>
                  <p className="account-small">
                    Demo preferences only. No email, SMS, marketing or
                    notifications are sent.
                  </p>
                </div>
              </details>

              <details className="account-settings-section panel">
                <summary>
                  Automatic welcome
                  <span>Off by default · owner controls only</span>
                </summary>
                <div className="account-details-body">
                  <p>
                    A saved text acknowledgment can welcome a new request. It
                    never implies someone has read or prayed over it.
                  </p>
                  <p>
                    This optional box welcome is separate from Prayer Box’s
                    first automatic comment, which only the requester can see.
                    Changing this setting does not turn that private platform
                    acknowledgment on or off.
                  </p>
                  <label className="field">
                    Box you own
                    <select value={ownedAutomaticBox} disabled>
                      {groupAdmin ? (
                        <option value="grace">{organizationName} · admin</option>
                      ) : (
                        <option value="personal">My personal box</option>
                      )}
                    </select>
                  </label>
                  <label className="field">
                    Fictional template
                    <select
                      value={automaticFixture}
                      onChange={(event) => {
                        setAutomaticFixture(
                          event.target.value as typeof automaticFixture,
                        );
                        updateAutomaticDraft();
                      }}
                    >
                      <option value="thanks">A gentle thank-you</option>
                      <option value="standing">
                        A standing commitment to prayer
                      </option>
                    </select>
                  </label>
                  <div className="account-template-preview">
                    <span className="account-pill">
                      Automatic message from{" "}
                      {ownedAutomaticBox === "personal"
                        ? "your personal box"
                        : "Grace Church"}
                    </span>
                    <p>{template}</p>
                    <span className="account-small">
                      Version 1 · fictional preview
                    </span>
                  </div>
                  <div className="account-template-status">
                    <span
                      className={`account-status ${automaticStatus === "approved" ? "account-status-paid" : ""}`}
                    >
                      {automaticStatus === "draft"
                        ? "Draft · not reviewed"
                        : automaticStatus === "pending"
                          ? "Under review · simulation"
                          : "Approved · simulation"}
                    </span>
                    {automaticStatus === "draft" ? (
                      <button
                        className="button secondary"
                        onClick={() => {
                          feedback.prepare();
                          setAutomaticStatus("pending");
                          feedback.respond({
                            tone: "pending",
                            title:
                              "Your demo welcome template is awaiting review.",
                            message:
                              "It cannot send or be enabled while this example is pending.",
                          });
                        }}
                      >
                        Simulate submitting for review
                      </button>
                    ) : automaticStatus === "pending" ? (
                      <button
                        className="button secondary"
                        onClick={() => {
                          feedback.prepare();
                          setAutomaticStatus("approved");
                          onNotice(
                            "Fictional template review is complete. This is not working content screening.",
                          );
                          feedback.respond({
                            tone: "success",
                            title: "Your template review example is complete.",
                            message:
                              "Approval was simulated in this browser. No live content screening happened.",
                          });
                        }}
                      >
                        Simulate review approval
                      </button>
                    ) : null}
                  </div>
                  <label className="account-checkbox-row account-switch-row">
                    <PreferenceSwitch
                      checked={automaticEnabled}
                      disabled={automaticStatus !== "approved"}
                      onChange={(checked) => {
                        feedback.prepare();
                        setAutomaticEnabled(checked);
                        onAutomaticChange?.(
                          checked,
                          ownedAutomaticBox,
                          template,
                        );
                        const deliveryModeled =
                          viewer === "elena" ||
                          viewer === "maria" ||
                          groupAdmin;
                        feedback.respond({
                          tone: deliveryModeled ? "success" : "info",
                          title: deliveryModeled
                            ? "Your demo welcome preference is updated."
                            : "Your welcome preference preview is updated.",
                          message: !deliveryModeled
                            ? "Only this viewer’s preference preview changed. Their personal box is not modeled; no demo deliveries or other boxes were changed."
                            : checked
                              ? "The reviewed example is on for new approved demo deliveries only. No older request receives a message."
                              : "The optional demo box welcome is off. No external message was sent.",
                        });
                      }}
                    />
                    <span>
                      Automatically welcome new prayer requests
                      <small>
                        {automaticStatus === "approved"
                          ? "Applies to new accepted deliveries only. Disable anytime."
                          : "Review approval is required before enabling."}
                      </small>
                    </span>
                  </label>
                  <p className="account-small">
                    At most one versioned receipt per accepted delivery, visible
                    only to its requester and authorized recipients. No
                    retroactive messages, media generation or email/SMS opt-in.
                    These delivery rules need a backend.
                  </p>
                </div>
              </details>

              <details className="account-settings-section panel">
                <summary>
                  Blocks & account safety
                  <span>Control what reaches your box</span>
                </summary>
                <div className="account-details-body">
                  <p>
                    Blocking or reporting removes that account’s incoming
                    requests and related material from the affected box or view.
                    It does not erase separate deliveries elsewhere.
                  </p>
                  <p>
                    In a church inbox, an ordinary member filters their own
                    view. Only an authorized admin acts for the organization. A
                    personal block cannot secretly exclude an approved member
                    from a whole-church audience.
                  </p>
                  <button className="button secondary" onClick={onManageBlocked}>Manage blocked accounts</button>
                  <button className="button secondary" onClick={() => onNavigate("church")}>Your prayer groups and friends</button>
                  <button
                    className="text-link account-danger-link"
                    onClick={() => setDialog("delete")}
                  >
                    Account deletion information
                  </button>
                </div>
              </details>
            </div>
            <aside className="account-settings-rail">
              <div className="account-privacy-note">
                <span className="account-soft-icon">
                  <AccountIcon name="shield" size={25} />
                </span>
                <h2>Private means cared for.</h2>
                <p>
                  Your profile, your request’s audience and your chosen
                  recipients are separate choices.
                </p>
                <p>
                  Anonymous posts hide your identity from recipients and church
                  members. Names in your words, photos or voice can still
                  identify you.
                </p>
                <button
                  className="text-link"
                  onClick={() => onNavigate("about")}
                >
                  Our prayer community <AccountIcon name="arrow" size={16} />
                </button>
              </div>
              <div className="account-settings-utility">
                <AccountIcon name="note" />
                <div>
                  <strong>My donations</strong>
                  <p>Private records & monthly plan</p>
                  <button
                    className="text-link"
                    onClick={() => onNavigate("donation-history")}
                  >
                    Open my records
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </>
      ) : null}

      {dialog === "contribution" && contributionPreview ? (
        <AccountDialog
          title="A contribution preview"
          onClose={() => setDialog(null)}
          className="donation-dialog"
        >
          <p className="account-dialog-note">
            Fictional flow · no payment entry or charge
          </p>
          <dl className="account-review-lines">
            <div>
              <dt>Amount</dt>
              <dd>{money(contributionPreview.cents / 100)} USD</dd>
            </div>
            <div>
              <dt>Frequency</dt>
              <dd>
                {contributionPreview.frequency === "monthly"
                  ? "Every month"
                  : "One-time"}
              </dd>
            </div>
            <div>
              <dt>First example billing</dt>
              <dd>{fundingAsOf}</dd>
            </div>
            {contributionPreview.frequency === "monthly" ? (
              <div>
                <dt>Next example billing</dt>
                <dd>{fundingDates[1]}</dd>
              </div>
            ) : null}
          </dl>
          {contributionPreview.frequency === "monthly" ? (
            <p>
              You would authorize {money(contributionPreview.cents / 100)} USD
              per month. This three-month preview includes today and{" "}
              {fundingDates[1]} and {fundingDates[2]}:{" "}
              {money((contributionPreview.cents * 3) / 100)} USD total. On
              confirmation, the first simulated payment is added to received
              funds; the next two remain expected. A real renewal would need a
              fresh rolling-window check and pause or reduction when no need
              remains. You can cancel from My donations at any time, including
              if posting is restricted.
            </p>
          ) : (
            <p>
              This example is a single contribution with no future recurring
              charge.
            </p>
          )}
          <p className="account-small">
            Public display would say Anonymous. Tax eligibility and excess-funds
            use are not approved. This prototype does not accept money or create
            a subscription.
          </p>
          <div className="account-dialog-actions">
            <button
              className="button secondary"
              onClick={() => setDialog(null)}
            >
              Go back
            </button>
            <button
              className="button"
              onClick={() => {
                feedback.prepare();
                const currentError = validateFundingContribution(
                  fundingInput,
                  contributionPreview.cents,
                  contributionPreview.frequency,
                );
                if (currentError) {
                  setDialog(null);
                  setAmountError(currentError);
                  feedback.respond({
                    tone: "error",
                    title: "The remaining need changed.",
                    message: currentError,
                  });
                  return;
                }
                // Model amounts only, never a real payment or financial record.
                const simulated = withFundingContribution(
                  fundingInput,
                  contributionPreview.cents,
                  contributionPreview.frequency,
                );
                setSimulatedReceived(
                  simulated.receivedGrossCents - scenarioGross,
                );
                if (contributionPreview.frequency === "monthly") {
                  setSimulatedMonthly(
                    (previous) => previous + contributionPreview.cents,
                  );
                  setPlanActive(true);
                  setPlanAmount(
                    (simulatedMonthly + contributionPreview.cents) / 100,
                  );
                  setPlanNextDay(Number(fundingAsOf.slice(-2)));
                }
                setDialog(null);
                onNotice(
                  `Preview complete: ${money(contributionPreview.cents / 100)} USD ${contributionPreview.frequency === "monthly" ? "monthly" : "one-time"}. No money was charged and no subscription was created.`,
                );
                feedback.respond({
                  tone: "success",
                  title: "Thank you for caring for this little space.",
                  message:
                    "Your contribution preview is complete. No money was charged and no subscription was created.",
                });
              }}
            >
              Simulate{" "}
              {contributionPreview.frequency === "monthly"
                ? "monthly plan"
                : "contribution"}
            </button>
          </div>
        </AccountDialog>
      ) : null}
      {dialog === "cancel" ? (
        <AccountDialog
          title="Cancel the example monthly plan?"
          onClose={() => setDialog(null)}
          className="donation-dialog"
        >
          <p>
            The fictional {money(planAmount)} USD monthly plan will end
            immediately. Its {fundingWindow.months[1].label.split(" ")[0]}{" "}
            {planNextDay}, {fundingWindow.months[1].label.split(" ")[1]} example
            renewal will not occur.
          </p>
          <p>
            Your private contribution records remain available. No real
            subscription exists.
          </p>
          <div className="account-dialog-actions">
            <button
              className="button secondary"
              onClick={() => setDialog(null)}
            >
              Keep example plan
            </button>
            <button
              className="button"
              onClick={() => {
                feedback.prepare();
                setPlanActive(false);
                setSimulatedMonthly(0);
                setDialog(null);
                onNotice(
                  `Example monthly plan canceled effective ${fundingAsOf}. No future example renewals. No real billing was changed.`,
                );
                feedback.respond({
                  tone: "success",
                  title: "Your example monthly plan is canceled.",
                  message:
                    "No future demo renewals remain. No real billing or subscription was changed.",
                });
              }}
            >
              Cancel example plan
            </button>
          </div>
        </AccountDialog>
      ) : null}
      {dialog === "delete" ? (
        <AccountDialog
          title="Your account, your choice"
          onClose={() => setDialog(null)}
        >
          <p>
            No real account was created in this prototype. A future deletion
            flow must explain what is removed, required financial-record
            retention, appeal evidence, and how a recurring contribution is
            canceled.
          </p>
          <p>
            Deletion must never leave you unable to manage billing or retrieve
            permitted records. The production retention and recovery policy
            still needs approval.
          </p>
          <button className="button" onClick={() => setDialog(null)}>
            Understood
          </button>
        </AccountDialog>
      ) : null}
    </div>
  );
}
