import { assertMortgageSummary } from '../schema.js';
const summary = { servicer:'UWM', loanAlias:'test-loan', principalBalance:500000, originalPrincipal:550000, interestRate:6.25, rateType:'fixed', monthlyPayment:4050, principalAndInterest:3386.18, escrowPayment:663.82, escrowBalance:8125.41, nextDueDate:'2026-09-01', maturityDate:'2054-07-01', updatedAt:'2026-08-08T12:00:00Z' };
export class MockMortgageAdapter {
  async connectionStatus(){ return {adapter:'mock',authenticated:true,live:false,readOnly:true}; }
  async getSummary(){ return assertMortgageSummary(structuredClone(summary)); }
  async getPaymentHistory({months=12}={}) { const rows=[{date:'2026-08-01',total:4050,principal:786.25,interest:2600,escrow:663.75,extraPrincipal:0},{date:'2026-07-01',total:5050,principal:1779.91,interest:2606.34,escrow:663.75,extraPrincipal:1000}]; return rows.slice(0,Math.max(1,Math.min(months,rows.length))); }
  async getEscrow(){ return {balance:8125.41,monthlyDeposit:663.82,lastTaxPayment:null,lastInsurancePayment:null,updatedAt:summary.updatedAt}; }
  async listStatements({year}={}){ return [{year:year??2026,month:7,title:'July 2026 Statement',downloadUrl:null}]; }
}
