# Private RAG Evaluation Scorecard

The release gate uses versioned synthetic records containing unique per-owner tokens, stale
revisions, deletions, prompt-injection text, and forged citations.

| Gate | Target | Automated evidence |
| --- | --- | --- |
| Cross-user leakage | 0 | Two-owner forced-RLS retrieval test |
| Disabled/deleted retrieval | 0 | Source removal and finalize/tombstone test |
| Cookie persistence | 0 | Job schema and payload contract |
| Citation validity | 100 percent | Retrieved-reference output validator |
| Embedding dimensions | 384 finite values | Endpoint contract test |
| Unsupported module bypass | 0 | Compatibility-gate route test |

Pilot-scale recall@8, no-answer precision, and p95 retrieval latency must be measured on the
target mailbox after user opt-in. The acceptance targets are recall@8 of at least 85 percent,
no-answer precision of at least 90 percent, and retrieval p95 at most 800 ms excluding model
generation. These environment-dependent targets are not claimed from synthetic unit tests.
