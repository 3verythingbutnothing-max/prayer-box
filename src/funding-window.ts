/** Monthly display arithmetic only. No payment processing or funding-based cap. */
export type FundingInput = { asOf: string; costCents: number; receivedGrossCents: number; feesCents: number; refundsCents: number };
export type FundingWindow = { label: string; costCents: number; receivedNetCents: number; remainingCents: number; surplusCents: number; covered: boolean };
function cents(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Use a nonnegative whole number of cents.');
  return value;
}
function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Use an ISO calendar date.');
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || year > 9998 || date.toISOString().slice(0,10) !== value) throw new Error('Use a valid ISO calendar date.');
  return {year,month,day,date};
}
export function fundingToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function nextMonthlyFundingDate(asOf: string) {
  const {year,month,day}=dateParts(asOf);
  const lastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  return new Date(Date.UTC(year,month,Math.min(day,lastDay))).toISOString().slice(0,10);
}
export function buildMonthlyFunding(input: FundingInput): FundingWindow {
  const {date}=dateParts(input.asOf);
  const cost=cents(input.costCents), gross=cents(input.receivedGrossCents);
  const fees=cents(input.feesCents), refunds=cents(input.refundsCents);
  if (!Number.isSafeInteger(fees+refunds) || fees+refunds>gross) throw new Error('Fees and refunds cannot exceed received funds.');
  const net=gross-fees-refunds;
  return {label:new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(date),costCents:cost,receivedNetCents:net,remainingCents:Math.max(0,cost-net),surplusCents:Math.max(0,net-cost),covered:net>=cost};
}
export function validateFundingContribution(amountCents:number) {
  return Number.isSafeInteger(amountCents) && amountCents>=1 && amountCents<=1_000_000 ? null : 'Enter $0.01–$10,000 USD, using no more than two decimal places.';
}
