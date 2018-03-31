# Time Oracle

<!-- cspell:ignore tlsdate,roughtime -->

[**exonum-time**][exonum-time] is a time oracle service for Exonum.
This service allows determining time,
importing it from the external world to the blockchain
and keeping its current value in the blockchain.

## The Problem

Implementing the business logic of many practical blockchain solutions requires
that one should be able to access the calendar time.
The time can be obtained by executing certain logic on the blockchain.
This logic should meet the following criteria:

- **Using validators**. As Exonum is used to power permissioned blockchains,
  it is natural to assume that the inputs to business logic determining time
  should be supplied by validators. This assumption could be generalized to support
  abstract semi-trusted identifiable entities, but for the sake of clarity,
  this article will center specifically on the case where time
  is determined by the validator nodes.
- **Reliability**. The time value must be tolerant to the malicious behavior
  of validator nodes.
- **Agreement**. Time must be the same on all the nodes to ensure that
  transactions are executed in a deterministic manner. This means that the time
  should be written in the Exonum blockchain storage. Thus, the “current” time
  will be changing in the same way on all nodes during the execution of transactions,
  including during the nodes update.
- **Sufficient accuracy**. The specified time should be fairly accurate.
  In practice, an acceptable deviation is a few seconds.
- **Monotony**. The time value should only increase. This pragmatic requirement simplifies the use of time when implementing the business logic.

## Assumptions

The local time on all validator nodes is assumed to be reliable.
To obtain the local reliable time, validators can apply external solutions like [tlsdate][tlsdate],
[roughtime][roughtime], etc.

If the local time on the validator machine is incorrect,
such node is considered Byzantine. Just in the same way as the consensus algorithm,
the algorithm used by the time oracle can tolerate up to a third of Byzantine
validators.

## General Idea

Each validator at a specific time sends a transaction indicating its local time
(usually immediately after the commit of each block). The time service maintains
an index with the most current time values indicated separately by each validator.
A 1/3 percentile of these values (ordered by decreasing time) is stored separately;
this percentile is considered the actual time and is updated after each transaction
from any of the validators. As we show [further](#proof-of-correctness),
this time can be considered reliable given the assumptions above.

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
2. Check that the time indicated in the transaction is greater than the submitting validator's timestamp specified in the storage. If not, quit.
3. Update validator’s time in the `validators_time` index.
4. If the number of timestamps in the index belonging to the current validators
   is at least `2f + 1`, where `f = (n - 1) / 3` is the maximum number
   of Byzantine validators, then perform the following steps; else quit.
5. Sort the timestamps by the current validators in the decreasing order
  (most recent time first).
6. Take the time with the (1-based) index `f + 1` from the resulting sorted list.
7. If the taken time `t` is larger than the previous consolidated time,
  replace the consolidated time with `t`.

Thus, the consolidated time can be updated after each transaction with
the actual time from any validator node. The procedure takes into account the
possible changes in the validators list, ensures monotony of `time`, and
is tolerant to the malicious behavior of validator nodes.

## Proof of Correctness

Let `T` denote the list of current validators’ timestamps sorted
in the decreasing order, as specified in step 5 of the algorithm above.
It is clear that in a system with no more than `f` Byzantine nodes,
any time from `T` with the (1-based) index in the `[f + 1, 2f + 1]` interval is:

- The time of an honest node, or
- The time between the timestamps of two honest nodes. Therefore, such a time can be considered reliable.

For practical reasons, we always choose the timestamp with index `f + 1`,
since this value is reliable and, at the same time, the most recent one.

## REST API

The service exposes the following API endpoint for the public API:

- [Get the current consolidated time](#current-time)

The following endpoints are exposed for the private API:

- [Retrieve timestamps of the current validators](#timestamps-of-current-validators)
- [Dump timestamps of all validators](#timestamps-of-all-validators)

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

## Discussion

### Transaction Generation

The validator nodes can potentially generate and send transactions to update
the time any moment, however, in the current implementation, nodes send
transactions after the commit of each block.

### Oracle Initialization

At the time when a new blockchain is launched, the consolidated time is unknown
until the transactions from at least `2f + 1` validator nodes are processed.
Further, in the course of blockchain operation, this time
will strictly grow monotonously.

### Possible Alternatives

!!! tip
    Consult the [consensus description](../architecture/consensus.md) for
    explanation of `Propose` and `Precommit` messages, and the “+2/3” notation.

A possible alternative to implementing a time oracle as a service would be to
integrate it into the consensus algorithm. This would work as follows:
The validator includes its local time in each `Precommit` message.
At the next height, the leader includes +2/3 `Precommit`s of the previous block
into the `Propose`. The time median of these `Precommit`s is recorded into
the header of the block obtained based on this `Propose`.

Advantages:

- The time value would be indicated directly in the header of each block
  making it more accessible.
- Time would be forcibly updated in the course of consensus operation:
  it would be impossible to sabotage the update of time without stopping the consensus.
- Blockchain would not be clogged by transactions associated with time determination.

Disadvantages:

- The consensus code would become more complex. (Time would be included
  into the consensus logic while [anchoring](bitcoin-anchoring.md) and
  [configuration](configuration-updater.md) are not.)
- Time updates would be tied to the creation of `Precommit` messages. In the case
  of a large delay in block acceptance, all the transactions therein would
  be executed with the same outdated time value.

In our opinion, implementing the time oracle as a service is preferable to
the tight integration with consensus. This approach is more flexible and manageable,
and could be generalized to the agreement between arbitrary collectively trusted
entities, which may behave maliciously.

[exonum-time]: https://github.com/exonum/exonum/tree/master/services/time
[tlsdate]: https://github.com/ioerror/tlsdate
[roughtime]: https://roughtime.googlesource.com/roughtime
