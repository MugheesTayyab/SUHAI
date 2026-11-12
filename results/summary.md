# SUNSHARE CONTINUITY results

Exact best benefit: 25 (52 valid schedules out of 2048).

## Encoding cost (1 QAOA layer)

| Encoding | Qubits | Two qubit gates | Depth |
| --- | --- | --- | --- |
| Standard | 20 | 106 | 60 |
| SUNSHARE | 11 | 46 | 55 |

## SUNSHARE encoding by depth

| Layers | Valid share | Exact best share | Best valid benefit | Gap |
| --- | --- | --- | --- | --- |
| 1 | 24.5% | 1.10% | 25 | 0 |
| 2 | 52.6% | 3.15% | 25 | 0 |
| 3 | 69.8% | 6.88% | 25 | 0 |

Random guessing: 2.5% valid, 0.05% exact best.

## Same optimiser budget, both encodings

| Encoding | Layers | Valid share | Exact best share | Seconds |
| --- | --- | --- | --- | --- |
| Standard | 1 | 6.2% | 0.07% | 136.3 |
| Standard | 2 | 10.0% | 0.24% | 184.2 |
| SUNSHARE | 1 | 24.5% | 1.10% | 3.7 |
| SUNSHARE | 2 | 52.6% | 3.12% | 13.2 |

## Penalty sensitivity (SUNSHARE encoding)

| Penalty | Layers | Valid share | Exact best share |
| --- | --- | --- | --- |
| 12 | 1 | 24.5% | 1.10% |
| 12 | 2 | 52.6% | 3.15% |
| 12 | 3 | 69.8% | 6.88% |
| 20 | 1 | 33.2% | 0.73% |
| 20 | 2 | 65.7% | 1.93% |
| 20 | 3 | 84.2% | 2.83% |
| 40 | 1 | 38.2% | 0.68% |
| 40 | 2 | 75.4% | 0.76% |
| 40 | 3 | 89.2% | 0.61% |

## First come first served

Over all 24 arrival orders: lowest 9, highest 25, average 16.8. Only 5 orders reach the best.

## What if the battery had 10 kWh

Exact best benefit rises to 28. Best valid benefit sampled by QAOA at 3 layers: 28.
