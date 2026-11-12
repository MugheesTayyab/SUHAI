# Context Brief: SUNSHARE CONTINUITY

Read this before the implementation plan. It explains what we are building, why each decision was made, what is already done, and what you must not change. The implementation plan (`SUNSHARE_implementation_plan.md`) tells you how. This file tells you why, and where the traps are.

## 1. The situation

We are a student team in the Qiskit Fall Fest 2026 Hackathon. The deadline is **11:59pm tonight, Pakistan time**. This brief was written at about 7:00pm, so there are roughly five hours left. Finishing all four deliverables cleanly matters more than adding anything new.

The team has no prior quantum computing background. Every teammate must be able to explain the code in plain words to judges, so keep code simple, readable and well named. Do not add clever abstractions.

### The challenge

"How can quantum computing be used to address a meaningful real-world optimization problem with competing objectives or limited resources?" Teams pick one of six domains and define their own problem. Ours is **domain 6, Energy and Smart Infrastructure**.

The brief asks for six steps: identify the problem, formulate it (variables, objective, constraints, small test instance), justify the quantum algorithm, implement it in Qiskit, evaluate against a classical or exact reference, and reflect on limitations. Hardware and quantum speedup are explicitly not required.

### Deliverables (all four required)

1. GitHub repository with working, reproducible Qiskit code and a README with setup steps.
2. Report in .docx with results, the classical or exact comparison, an architecture diagram, and an honest limitations section.
3. Video pitch and demo of at most 3 minutes, shared as "anyone with the link".
4. Submission form: https://forms.gle/jSRrXaHkjVb7G7AK8

### Judging rubric (100 points)

| Criterion | Points | What it rewards |
| --- | --- | --- |
| A. Problem validity | 20 | Relevance to the domain, clear formulation, sensible scope, measurable objective and constraints |
| B. Meaningful quantum utilization | 25 | Correct mapping to qubits, justified algorithm, quantum part does real work, awareness of limitations |
| C. Implementation and validation | 25 | Working Qiskit code, interpretable outputs, valid exact baseline, reproducibility |
| D. Innovation and originality | 15 | Original problem, thoughtful modelling or technical extension |
| E. Presentation and defense | 15 | Clear explanation, good demo |

Half the points (B and C) come from the quantum mapping and the validation. Protect those first.

### Organiser rules

* Stay inside the chosen domain.
* Do not copy code from tutorials or other teams. Credit anything reused.
* Video must not exceed 3 minutes.
* No commits after the deadline. The last commit before the cutoff is judged.
* Be honest about what did not work. The organisers say limitations count in our favour.

## 2. The finalized idea

**SUNSHARE CONTINUITY: quantum scheduling of limited solar energy for essential village services.**

**One line pitch:** A village has too little solar power for one day, so which service runs when? We schedule it with a quantum algorithm, and we do it with 11 qubits where the standard method needs 20.

**The problem:** A village solar installation with a small battery powers a milk chiller, an irrigation pump, a water purifier and household lighting. Solar output changes through the day and there is not enough energy for everything. The operator must decide which service runs in which time slot. The clinic's vaccine fridge is protected before optimization and never competes.

### The test instance (do not change any of these numbers)

Energy is counted in blocks of 5 kWh. All values are synthetic and must be labelled as synthetic.

| Slot | Solar blocks |
| --- | --- |
| 0 Morning | 2 |
| 1 Midday | 4 |
| 2 Afternoon | 2 |
| 3 Evening | 0 |

Battery: 1 block, usable in one slot only. Using it costs 0.25 in the objective.

| Service | Energy | Allowed slots and benefit |
| --- | --- | --- |
| Milk chilling | 3 blocks | Morning 10, midday 8 |
| Irrigation | 3 blocks | Midday 7, afternoon 4 |
| Water purification | 2 blocks | Midday 6, afternoon 8 |
| Household essentials | 1 block | Evening 3 |

**Decision variables, in this exact order (this is also the qubit order):**
`m0, m1, i1, i2, w1, w2, h3, d0, d1, d2, d3`

The first seven are service choices (letter is the service, digit is the slot). The last four mean "use the battery block in that slot".

**Objective:** maximise total benefit minus 0.25 per battery block used.

**Rules:**
1. A service runs at most once.
2. Energy used in a slot cannot exceed solar plus battery in that slot.
3. At most one battery dispatch in total.
4. A service only runs in its allowed slots (enforced by only creating those variables).

**Exact answer, verified by enumeration of all 2,048 schedules:** milk in the morning with the battery, irrigation at midday, water in the afternoon, households unserved. Benefit 25, objective 24.75. Only 52 of the 2,048 schedules are valid.

## 3. The main contribution (this is what earns the quantum marks)

The standard way to put a "cannot exceed" rule on qubits adds helper (slack) qubits. For this instance that means 9 helpers, so **20 qubits**.

Our encoding lists the smallest combinations that break a rule and fines exactly those. It needs no helpers: **11 qubits, 16 fines**.

The 16 fines:

```
m0 and m1
i1 and i2
w1 and w2
m0 without d0
m1 and i1
m1 and w1 without d1
i1 and w1 without d1
i2 and w2
i2 without d2
h3 without d3
d0 and d1, d0 and d2, d0 and d3, d1 and d2, d1 and d3, d2 and d3
```

Two of these (`m1 and w1 without d1`, `i1 and w1 without d1`) involve three variables. So the model is a QUBO plus two higher order terms. QAOA applies them as three qubit interactions. Say this openly. Do not call the compact model a pure QUBO.

We run QAOA on both encodings and compare them. That comparison is the centre of the report and the video.

**Honest scope:** we do not claim this encoding is new to research. It is our adaptation. It works because each slot has few services, and it would grow quickly otherwise.

## 4. Decisions already made, and why

Do not reopen these. They were all considered and settled.

| Decision | Reason |
| --- | --- |
| One village, four services, four slots | Small enough to explain in 30 seconds and to verify exactly |
| Keep the teammate's scenario numbers unchanged | The exact answer is known and tested against |
| Protect the vaccine fridge outside the optimizer | Safety should not depend on a benefit score |
| Compact encoding as the main contribution | A plain QAOA library call would look like decoration. Saving qubits is a real quantum design decision |
| Dropped: custom XY mixer | It needs "exactly one" rules. This model has "at most one" rules |
| Dropped: fairness terms and memory across days | They belong to an earlier version of the idea. One clear contribution is easier to defend |
| Dropped: multiple villages, service levels, battery charging model | Too many qubits and too much to explain |
| Dropped from tonight: Streamlit dashboard, warm start QAOA, noise models, real hardware | Not needed to score well. List them as future work |
| Build the cost operator ourselves with core Qiskit | So every term can be explained, and so we do not depend on an extra package |

## 5. What is already built and verified

A complete, tested project exists as `sunshare-continuity.zip`. The implementation plan contains the identical code. **Prefer using this code as it is over rewriting it.** If you are asked to build from the plan, the result must match it.

* 18 automated checks pass (`python -m pytest tests -q`).
* `python run_all.py` reproduces every table and chart in about 9 minutes. `python run_all.py --quick` skips the 20 qubit runs and takes about 4 minutes.
* The tests prove: the exact best is 25; the compact encoding has 11 qubits and 16 fines; the slack encoding has 20 qubits; on all 2,048 schedules the compact cost equals the true objective for valid schedules and is worse by at least the penalty for invalid ones; for penalties 12, 20 and 40 the lowest cost bitstring of both encodings is the exact best; the Qiskit operator's diagonal equals the cost of every bitstring.

### Results from the verification run

These came from one machine (2 cores, Python 3.13, Qiskit 2.6.2, Aer 0.18.2). The team must rerun and report their own numbers.

| Measure | Standard, 20 qubits | SUNSHARE, 11 qubits |
| --- | --- | --- |
| Two qubit gates per layer | 106 | 46 |
| Circuit depth per layer | 60 | 55 |
| Valid schedules, 1 layer, same optimiser budget | 5.3% | 24.5% |
| Valid schedules, 2 layers, same optimiser budget | 10.0% | 52.6% |
| Exact best share, 2 layers | 0.17% | 3.15% |
| Simulation time, 1 layer | 142 s | 1.4 s |

* SUNSHARE encoding at 1, 2, 3 layers (full budget): valid share 24.5%, 52.6%, 69.8%. Exact best share 1.10%, 3.15%, 6.88%.
* Random guessing: 2.5% valid, 0.05% exact best.
* QAOA's best valid sample scored 25 at every depth, so the gap to exact is 0.
* First come first served over all 24 arrival orders: between 9 and 25, average 16.8, only 5 orders reach 25.
* With a 10 kWh battery the exact best becomes 28 and households are served. QAOA samples that schedule too.

## 6. Design choices inside the code (keep them)

* **Penalty is 12.** Higher penalties give more valid samples but fewer best samples (at penalty 40 and 3 layers: 89.2% valid but only 0.61% exact best). This trade off is a finding for the report.
* **The cost operator is divided by its largest coefficient** before building the circuit, so the angles stay in a sensible range. This does not change which schedule is best.
* **Deeper circuits start from the shallower result** with the new layer at zero. Without this, deeper circuits optimised worse than shallow ones.
* **Fair comparison:** the two encodings are compared with the same optimiser budget (3 starts, 150 iterations). The compact encoding's depth study uses a larger budget (8 starts, 300 iterations) and is reported separately.
* **Decoding is honest:** every sampled bitstring is checked against the original rules, helper qubits are dropped, and the reported schedule is the best valid one actually sampled. Classical code never substitutes the exact answer.
* **Seeds are fixed** for reproducibility.

## 7. Traps to avoid

* **Bit order.** Qiskit prints bitstrings with qubit 0 on the right. The code reverses each string before reading it. Getting this wrong silently scrambles every result.
* **Do not edit a test to make it pass.** A failing test means the code is wrong.
* **Do not change the scenario, the variable order or the penalty** without rerunning everything.
* **The 20 qubit runs are slow** (about 6 minutes of the full run). Use `--quick` for demos.
* **A deprecation warning about `QAOAAnsatz`** appears with this Qiskit version. It is harmless. Do not refactor to remove it tonight.
* **If a pinned package will not install,** loosen only that one line. Do not upgrade everything.
* **Do not add features.** No dashboard, no extra scenarios, no new algorithms.

## 8. Claims we may and may not make

**May say:**
* The mapping from schedule to qubits is correct and tested on every possible schedule.
* Our encoding uses 11 qubits instead of 20 and fewer than half the two qubit gates.
* QAOA sampled the exact best schedule, and valid samples are far more frequent than random guessing.
* At the same optimiser budget our encoding produced more valid samples than the standard one.

**Must not say:**
* That quantum is faster or better than classical here. Enumeration takes well under a second.
* That there is any quantum advantage or speedup.
* That QAOA "usually" returns the best schedule. It appears in a small share of samples and is found by keeping the best valid sample out of 4,096.
* That the data is real, or that benefit scores are measured facts. They are synthetic value judgments.
* That the compact encoding is a new research result or a pure QUBO.

## 9. What remains, in priority order

1. Confirm the code runs on the team's machine and the full run finishes. Commit results.
2. README in place, repository public on GitHub, clone test passes.
3. Report in .docx (the plan lists every section and which chart goes where).
4. Video of at most 3 minutes (the plan has a timed script).
5. Test every link in a private browser window. Submit the form by about 11:15pm.
6. No commits after submitting.

If time runs short, the report sections that carry the most points are: problem statement, formulation, quantum approach with the encoding comparison, results with the exact comparison, limitations, and the architecture diagram.

## 10. Writing rules for anything a human will read

* Simple words and short sentences. The team are beginners and so are some readers.
* No dashes used as punctuation. No dates in the report.
* Report measured numbers from the team's own run, not the numbers in this file.
* State limitations plainly. They earn marks here.
* The README credits AI assistance. Keep that line accurate.

## 11. When to stop and ask the team

Ask before you: change the scenario or any number in it, change what is claimed, add or remove a deliverable, push to GitHub, or submit the form. For anything else inside the plan, proceed.

## 12. Update after this brief was written: web app added

The team later chose to add a web app for the demo. This replaces the "no dashboard" lines in sections 4 and 7 for the web layer only. Everything else in this brief still holds. Read `SUNSHARE_web_plan.md` for the details.

* The web app lives in `server/`, `web/` and `serve.py`. It calls the tested functions in `src/` and adds no new solver.
* The only change to `src/` is an optional `progress` argument on `run_qaoa`. With the default `None` the results are identical.
* Tests are now 30: the original 18 plus 12 for the API in `tests/test_server.py`.
* Start it with `python serve.py`. The control room is at `/app`.
