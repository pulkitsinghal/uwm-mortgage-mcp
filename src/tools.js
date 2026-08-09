import { compareExtraPayment } from './calculations.js';
import { loginOptions } from './login-options.js';
const READ_ONLY={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true};
const LOCAL_ONLY={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
export function toolDefinitions(){return [
{name:'mortgage_connection_status',description:'Check adapter status and get guided 1Password/manual login plus user-completed MFA setup steps. Read-only.',inputSchema:{type:'object',additionalProperties:false},annotations:READ_ONLY},
{name:'mortgage_get_summary',description:'Get current mortgage balance, rate, payment, due date, and escrow summary. Read-only.',inputSchema:{type:'object',additionalProperties:false},annotations:READ_ONLY},
{name:'mortgage_get_payment_history',description:'Get mortgage payment history. Read-only.',inputSchema:{type:'object',properties:{months:{type:'integer',minimum:1,maximum:120,default:12}},additionalProperties:false},annotations:READ_ONLY},
{name:'mortgage_get_escrow',description:'Get current escrow information. Read-only.',inputSchema:{type:'object',additionalProperties:false},annotations:READ_ONLY},
{name:'mortgage_list_statements',description:'List available mortgage statements. Read-only; does not download without a later explicit implementation.',inputSchema:{type:'object',properties:{year:{type:'integer',minimum:2000,maximum:2100}},additionalProperties:false},annotations:READ_ONLY},
{name:'mortgage_calculate_extra_payment',description:'Project payoff acceleration and interest savings using mortgage summary data. No payment is initiated.',inputSchema:{type:'object',properties:{extraMonthly:{type:'number',minimum:0}},required:['extraMonthly'],additionalProperties:false},annotations:LOCAL_ONLY}
];}
export async function callTool(adapter,name,args={}){switch(name){case'mortgage_connection_status':return {...await adapter.connectionStatus(),login:loginOptions()};case'mortgage_get_summary':return adapter.getSummary();case'mortgage_get_payment_history':return adapter.getPaymentHistory(args);case'mortgage_get_escrow':return adapter.getEscrow();case'mortgage_list_statements':return adapter.listStatements(args);case'mortgage_calculate_extra_payment':{const s=await adapter.getSummary();const scheduledPayment=s.principalAndInterest??s.monthlyPayment-(s.escrowPayment??0);return compareExtraPayment({principal:s.principalBalance,annualRatePct:s.interestRate,scheduledPayment,extraMonthly:args.extraMonthly});}default:throw new Error(`Unknown tool: ${name}`);}}
