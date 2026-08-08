import test from 'node:test';import assert from 'node:assert/strict';import {projectExtraPayment,compareExtraPayment} from '../src/calculations.js';
test('extra payments shorten payoff and save interest',()=>{const result=compareExtraPayment({principal:500000,annualRatePct:6.25,scheduledPayment:3386.18,extraMonthly:1000});assert.ok(result.monthsSaved>0);assert.ok(result.interestSaved>0);});
test('rejects negatively amortizing payment',()=>{assert.throws(()=>projectExtraPayment({principal:500000,annualRatePct:12,scheduledPayment:100,extraMonthly:0}),/does not cover/);});
