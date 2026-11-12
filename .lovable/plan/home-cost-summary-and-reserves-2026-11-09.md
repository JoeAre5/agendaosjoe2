# Home cost summary and reserves

## Requested result
Keep everything currently shown in the admin Home profit-and-cost summary. Append a clear, spacious closing section:

- **Operating reserve / Reserva operativa:** all entered operating expenses combined.
- **Payroll reserve / Reserva para nómina:** a combined gross amount with two indented lines, **Commissions / Comisiones** and **W-2 wages / Salarios W-2**.
- **Total to set aside / Total a reservar:** operating reserve plus payroll reserve.
- **Total costs / Costos totales:** a prominent red amount at the end, including the existing service fees, gross payroll and operating expenses.

Labels reference the selected day, week or month, including historical selections. All existing itemized expenses, profit, margin, fee disclosures and payroll details remain intact.

## Review and scope (A–I)
**A. Problem, VERIFIED:** the current summary lists deductions but lacks a closing cost total and a combined operating/payroll reserve view.

**B. Evidence, VERIFIED:** Home already calculates period-specific operating expenses, earned gross commissions and gross fixed W-2 wages.

**C. Cause, VERIFIED:** these amounts appear in separate places rather than in a single reserve breakdown. No missing financial data is needed for this addition.

**D. Minimum solution, PROPOSED:** reuse those existing amounts in a presentation-only closing section. Reserves are planning estimates, not money already transferred or amounts remaining unpaid.

**E. Alternatives:** a saved reserve account or new payroll calculator is unnecessary and outside scope. All operating expenses belong together, as confirmed.

**F. Impact:** admin Home only. No changes to accounting, finalized payroll, payments, Acuity, appointments, expense entry or stored financial records. No new queries or database changes.

**G. Risks and limits:** use gross payroll, not net employee payouts, so employee withholding is not omitted from the reserve. Tips remain excluded. Employer taxes are not calculated by the existing Home estimate; do not invent them. Service fees appear in total costs but not in the operating/payroll reserve, because they are already deducted from production. Show a concise estimate note to avoid implying a funded account.

**H. Validation, PROPOSED:** run existing financial/period/expense tests; check reserve arithmetic and that fees are counted only once. Verify the authenticated Home view in daily, weekly and monthly selections and on mobile, preserving current details without financial writes. Live amounts and appearance are NOT VERIFIED yet.

**I. Authorization:** approve this plan before adding the closing section. No deployment, production data changes or new draft is included.

## Technical approach
Limit presentation changes to `src/components/tabs/ResumenTab.tsx`, reusing `financials.expenses`, `financials.personnel`, existing commission/W-2 estimates and `serviceFees.totalCents`. Use existing semantic red, text and divider tokens, with no duplicate expense allocation or payroll engine.