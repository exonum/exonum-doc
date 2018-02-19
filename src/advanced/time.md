# Time Oracle

<!-- cspell:ignore tlsdate,roughtime -->

[**exonum-time**][exonum-time] is a time oracle service for Exonum.
This service allows to determine time,
import it from the external world to the blockchain
and keep its current value in the blockchain.

## The Problem

Implementing the business logic of many practical blockchain solutions requires
that one should be able to access the calendar time.
The time can be obtained by executing certain logic on the blockchain.
This logic should meet the following criteria:

- **Using validators**. As Exonum is used to power permissioned blockchain,
  it is natural to assume that the inputs to business logic determining time
  are supplied by validators. This assumption could be generalized to support
  abstract semi-trusted identifiable entities, but for the sake of clarity,
  the future discussion will center specifically on the case where the time
  is determined by the validator nodes.
- **Reliability**. The time value must be tolerant to the malicious behavior
  of validator nodes.
- **Agreement**. The time must be the same on all the nodes to ensure that
  transactions are executed in a deterministic manner. This means that the time
  should be written in the Exonum blockchain storage. Thus, the “current” time
  will be changing in the same way on all nodes during execution of transactions,
  including during nodes update.
- **Sufficient accuracy**. The specified time should be fairly accurate.
  In practice, an acceptable deviation is a few seconds.
- **Monotony**. The time value should only increase. A pragmatic requirement,
  which simplifies use of time when implementing the business logic.

## Preliminaries

Two possible approaches satisfying the above criteria are
[integration with consensus](#integration-with-consensus)
and [a time oracle service](#time-oracle-service).

### Integration with Consensus

!!! tip
    Consult the [consensus description](../architecture/consensus.md) for
    explanation of `Propose` and `Precommit` messages, and the “+2/3” notation.

The validator includes its local time in each `Precommit` message.
At the next height the leader includes +2/3 `Precommit`s of the previous block
into the `Propose`. The time median of these `Precommit`s is recorded into
the header of the block obtained based on this `Propose`.

#### Advantages

- The time value is indicated directly in the header of each block making it
  more accessible.
- Time is forcibly updated in the course of consensus operation:
  it is impossible to sabotage update of time without stopping consensus.
- Blockchain is not clogged by transactions associated with time determination.

#### Disadvantages

- The consensus code becomes more complex. (Time is included into the consensus
  logic while [anchoring](bitcoin-anchoring.md) and
  [configuration](configuration-updater.md) are not.)
- Time updates are tied to creation of `Precommit` messages. In the case
  of a large delay in block acceptance, all the transactions therein will
  be executed with the same outdated time value.

### Time Oracle Service

Each validator at a specific time sends a transaction indicating its local time
(usually immediately after the commit of each block). Exonum storage contains
an index with the most current time indicated separately by each validator.
A median of these index values is stored separately; it is considered the
actual time and is updated after each transaction from any of the validators.

#### Advantages

- The logic for time update is placed in a separate plug-in service
  (modularity).
- In case of a long delay in block acceptance, the time will be updated along
  with the delayed block execution while executing its transactions.
  The time will be accurate enough with regard to the time of the transaction
  entry into the mempool.

#### Disadvantages

- The time value is stored in the Exonum storage; hence,
  verifying its authenticity requires additional
  cryptographic checks from lightweight clients.
- Exonum blocks are burdened with time oracle transactions
  (usually one for each validator).

### Choosing Approach

Given the pros and cons above, **exonum-time** uses the time oracle approach
as a more flexible one.

## Assumptions

The local time on all validator nodes is assumed to be reliable.
To obtain local reliable time validators can apply external solutions like [tlsdate][tlsdate],
[roughtime][roughtime], etc.

If the local time on the validator machine is incorrect,
such node is considered Byzantine. Just in the same way as the consensus algorithm,
the algorithm used by the time oracle can tolerate up to a third of Byzantine
validators.

## Specification

### Schema

The data schema of the **exonum-time** service consists of two indices:

- **time**  
  Consolidated time output by the service, which can be used by other business
  logic on the blockchain.
- **validators_time**  
  Merkelized index with the latest known local timestamps for all validator nodes.
  The values in the index are used to update `time` and could be useful
  for monitoring, diagnostics and the like.

### Transactions

The service implements a single transaction type, allowing a validator to
output its current time, authenticated by the validator’s digital signature.

The logic of transaction execution is as follows:

1. Check that the transaction signer is one of the validators. If not, quit.
2. Check that the time specified in the transaction is greater than timestamp
  of the submitting validator specified in the storage. If not, quit.
3. Update validator’s time in the `validators_time` index.
4. If the number of the timestamps in the index belonging to the current validators
   is at least `2f + 1`, where `f = (n - 1) / 3` is the maximum number
   of Byzantine validators, then perform the following steps; else quit.
5. Sort the timestamps by the current validators in the decreasing order
  (most recent time first).
7. Take the time with the (1-based) index `f + 1` from the resulting sorted list.
9. If the taken time `t` is larger than the previous consolidated time,
  replace the consolidated time with `t`.

Thus, the consolidated time can be updated after each transaction with
the actual time from any validator node. The procedure takes into account
possible changes in the validators list, ensures monotony of `time`, and
is tolerant to the malicious behavior of validator nodes.

## Proof of Correctness

Let `T` denote the list of current validators’ timestamps sorted
in the decreasing order, as specified on step 5 of the algorithm above.
It is clear that in a system with no more than `f` Byzantine nodes,
any time from `T` with the (1-based) index in the `[f + 1, 2f + 1]` interval is:

- The time of an honest node, or
- The time between the timestamps of two honest nodes
  (and therefore such a time can be considered reliable).

For practical reasons, we always choose the timestamp with index `f + 1`,
since this value is reliable and at the same time the most recent one.

## Discussion

The validator nodes can potentially generate and send transactions to update
the time any moment, however, in the current implementation the nodes send
the transactions after commit of each block.

At the time when a new blockchain is launched, the consolidated time is unknown
until the transactions from at least `2f + 1` validator nodes are processed.
Further in the course of blockchain operation this time
will strictly grow monotonously.

## REST API

The service exposes the following API endpoints for the public API:

- [Get the current consolidated time](#current-time)

The following endpoints are exposed for private API:

- [Retrieve timestamps of the current validators](#timestamps-of-current-validators)
- [Dump timestamps for all validators](#timestamps-of-all-validators)

All REST endpoints share the same base path, denoted **{base_path}**,
equal to `api/services/exonum_time/v1`.

!!! warning
    As of version 0.5.0, the **exonum-time** service does not provide cryptographic
    proofs of authenticity for returned values.

### Current Time

```none
GET {base_path}/current_time
```

Returns the current consolidated time.

#### Parameters

None.

#### Response

Example of JSON response:

```json
{
  "nanos_since_epoch": 15555000,
  "secs_since_epoch": 1516106164
}
```

`null` is returned if there is no consolidated time.

### Timestamps of Current Validators

```none
GET {base_path}/validators_times
```

Returns the latest timestamps indicated by current validator nodes.

#### Parameters

None.

#### Response

Example of JSON response:

```json
[
  {
    "public_key": "83955565ee605f68fe334132b5ae33fe4ae9be2d85fbe0bd9d56734ad4ffdebd",
    "time": {
      "nanos_since_epoch": 626107000,
      "secs_since_epoch": 1516011501
    }
  },
  {
    "public_key": "52baa9d4c4029b925cedf1a1515c874a68e9133102d0823a6de88eb9c6694a59",
    "time": null
  }
]
```

### Timestamps of all validators

```none
GET {base_path}/validators_times/all
```

Returns the latest timestamps indicated by all validator nodes
for which time is known.

#### Parameters

None.

#### Response

Example of JSON response:

```json
[
  {
    "public_key": "83955565ee605f68fe334132b5ae33fe4ae9be2d85fbe0bd9d56734ad4ffdebd",
    "time": {
      "nanos_since_epoch": 626107000,
      "secs_since_epoch": 1516011501
    }
  },
  {
    "public_key": "f6753f4b130ce098b1322a6aac6accf2d5770946c6db273eab092197a5320717",
    "time": {
      "nanos_since_epoch": 581130000,
      "secs_since_epoch": 1514209665
    }
  }
]
```

[exonum-time]: https://github.com/exonum/exonum/tree/master/services/time
[tlsdate]: https://github.com/ioerror/tlsdate
[roughtime]: https://roughtime.googlesource.com/roughtime
