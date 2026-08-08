export function assertMortgageSummary(value) {
  if (!value || typeof value !== 'object') throw new Error('Mortgage summary must be an object');
  const required = ['servicer', 'principalBalance', 'interestRate', 'monthlyPayment', 'nextDueDate', 'updatedAt'];
  for (const key of required) if (value[key] === undefined || value[key] === null) throw new Error(`Missing summary field: ${key}`);
  for (const key of ['principalBalance', 'interestRate', 'monthlyPayment']) if (!Number.isFinite(value[key])) throw new Error(`Invalid number: ${key}`);
  return value;
}

export function assertPayment(value) {
  if (!value || typeof value !== 'object') throw new Error('Payment must be an object');
  if (!value.date) throw new Error('Payment missing date');
  if (!Number.isFinite(value.total)) throw new Error('Payment total must be numeric');
  return value;
}
