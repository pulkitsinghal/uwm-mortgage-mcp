export function projectExtraPayment({ principal, annualRatePct, scheduledPayment, extraMonthly = 0 }) {
  for (const [name, value] of Object.entries({ principal, annualRatePct, scheduledPayment, extraMonthly })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  }
  if (principal === 0) return { months: 0, totalInterest: 0, totalPaid: 0 };
  const monthlyRate = annualRatePct / 100 / 12;
  const payment = scheduledPayment + extraMonthly;
  if (payment <= 0) throw new Error('Total monthly payment must be positive');
  if (monthlyRate > 0 && payment <= principal * monthlyRate) throw new Error('Payment does not cover monthly interest');
  let balance = principal, totalInterest = 0, months = 0;
  const maxMonths = 1200;
  while (balance > 0.005 && months < maxMonths) {
    const interest = balance * monthlyRate;
    totalInterest += interest;
    balance = Math.max(0, balance + interest - payment);
    months += 1;
  }
  if (months >= maxMonths && balance > 0.005) throw new Error('Projection exceeded 100 years');
  return { months, totalInterest: round2(totalInterest), totalPaid: round2(principal + totalInterest) };
}
export function compareExtraPayment(args) {
  const baseline = projectExtraPayment({ ...args, extraMonthly: 0 });
  const accelerated = projectExtraPayment(args);
  return { baseline, accelerated, monthsSaved: baseline.months - accelerated.months, interestSaved: round2(baseline.totalInterest - accelerated.totalInterest) };
}
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
