import fs from 'node:fs/promises';
import { assertMortgageSummary, assertPayment } from '../schema.js';
export class SnapshotMortgageAdapter {
  constructor(path){ this.path=path; }
  async #read(){ if(!this.path) throw new Error('UWM_MCP_SNAPSHOT is not configured'); const parsed=JSON.parse(await fs.readFile(this.path,'utf8')); if(parsed.schemaVersion!==1) throw new Error('Unsupported snapshot schemaVersion'); return parsed; }
  async connectionStatus(){ try { const data=await this.#read(); return {adapter:'snapshot',authenticated:false,live:false,readOnly:true,capturedAt:data.capturedAt??null}; } catch(error){ return {adapter:'snapshot',authenticated:false,live:false,readOnly:true,error:error.message}; } }
  async startLogin(){ throw new Error('Guided login is available only in live mode'); }
  async getSummary(){ return assertMortgageSummary((await this.#read()).summary); }
  async getPaymentHistory({months=12}={}){ const rows=(await this.#read()).payments??[]; return rows.slice(0,months).map(assertPayment); }
  async getEscrow(){ return (await this.#read()).escrow??null; }
  async listStatements({year}={}){ const rows=(await this.#read()).statements??[]; return year?rows.filter(x=>x.year===year):rows; }
}
