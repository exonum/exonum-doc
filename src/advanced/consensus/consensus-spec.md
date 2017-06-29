# Consensus Algorithm Specification

This article contains the specification of [the consensus algorithm](../../home/glossary.md#consensus)
in Exonum.

Consensus algorithm in Exonum is a process of reaching an agreement about order
of [transactions](../../home/glossary.md#transaction) and the result of their
execution in the presence of [Byzantine faults][wiki_bft] and [partially
synchronous][partial_synchrony] network. During the consensus algorithm
nodes exchange [consensus messages](../../home/glossary.md#consensus-message)
authenticated with public-key crypto. These messages are processed via [a
message queue](#message-processing) and determine [transitions among
states](consensus.md#node-states-overview). The output of the consensus algorithm
is a sequence of blocks of transactions, which is guaranteed to be identical
for all honest nodes in the network.

!!! tip
    See [algorithm overview](consensus.md#algorithm-overview) and [list of
    assumptions](consensus.md#assumptions) for more details.

## Configuration Parameters

- `propose_timeout`  
  Proposal timeout after a new block is committed to the blockchain locally.

- `round_timeout`  
  Interval between algorithm rounds.

- `status_timeout`  
  Interval between `Status` message broadcasts.

!!! tip
    These parameters are a part of [the global configuration](../../architecture/configuration.md).
    They can be adjusted with the help of [the configuration update service](../services/configuration.md).

## Node State Variables

- `current_height`  
  Current blockchain height (i.e., the number of blocks in it).

- `queued`  
  Queue for consensus messages (`Propose`, `Prevote`, `Precommit`) from a
  future height or round.

- `proposes`  
  Hash map with known block proposals.

- `locked_round`  
  Round in which the node has [locked](consensus.md#locks) on a proposal.

- `current_round`  
  Number of current round.

- `locked_propose`  
  `Propose` on which node is locked (may be undefined).

- `state_hash`  
  Hash of the blockchain state.

## Consensus Messages

The consensus algorithm uses the following types of messages:
[`Propose`](consensus.md#propose), [`Prevote`](consensus.md#prevote),
[`Precommit`](consensus.md#precommit), [`Status`](consensus.md#status),
[`Block`](consensus.md#block). Only a part of their fields is described here. See
[source code][message_source] for more details.

The following fields are present for all messages:

- `validator_id`  
  Index of a validator in the `validators` list in the global configuration.

- `height`  
  Blockchain height to which the message is related.

- `round`  
  Round number to which the message is related.

- `hash`  
  Hash of the message.

`Propose` messages have the following additional fields:

- `prev_hash`  
  Hash of the previous block in the blockchain.

`Prevote` and `Precommit` messages have the following additional fields:

- `propose_hash`  
  Hash of the `Propose` message corresponding to this message.

`Precommit` messages have the following additional fields:

- `state_hash`  
  Hash of the blockchain state after the execution of all transactions in the
  `Propose` referenced by the precommit.

## Definitions

The definitions from the [general description of consensus algorithm](consensus.md)
are used. In particular, +2/3 means more than two thirds of the validators,
and -1/3 means less than one third.

### Pool of Unconfirmed Transactions

Each node has a set of transactions that have not yet been added to the
blockchain. This set is called _pool of unconfirmed transactions_. In general,
the pools of unconfirmed transactions are different for different nodes. If
necessary, the nodes [can request unknown transactions from other nodes](requests.md).

### Proof-of-Lock

A set of +2/3 `Prevote` messages for the same proposal from the nodes at current
round and blockchain height is called _Proof-of-Lock (PoL)_. Nodes store PoL as
a part of the node state. The node can have no more than one stored PoL.

A PoL is greater than recorded one (has a higher priority), in cases:

- There is no PoL recorded
- The recorded PoL corresponds to a proposal with a smaller round number

Thus, PoLs are [partially ordered][partial_ordering]. A node must
replace the stored PoL with a greater PoL if it is collected by the node during
message processing.

## Algorithm Stages

The algorithm proceeds in stages, transitions among which are triggered
by [incoming messages](#message-processing) and [timeouts](#timeout-processing).

- [Full proposal](#full-proposal)  
  Occurs when the node gets complete info about some proposal and all the
  transactions from the proposal.
- [Availability of +2/3 Prevotes](#availability-of-23-prevotes)  
  Occurs when the node collects +2/3 `Prevote` messages from the same round
  for the same known proposal.
- [Lock](#lock)  
  Occurs when the node replaces [the stored PoL](#proof-of-lock) (or collects
  its first PoL for the `current_height`).
- [Commit](#commit)  
  Occurs when the node collects +2/3 `Precommit` messages for the same round for
  the same known proposal. Corresponds to [the Commit node state](consensus.md#node-states-overview).

The steps performed at each stage are described [below](#stage-processing).

## Message Processing

Nodes use a message queue based on [the Mio library][mio_lib] for message processing.
Incoming request and consensus messages are placed in the queue when they are
received. The same queue is used for processing timeouts. Timeouts are
implemented as messages looped to the node itself.

Messages from the next height (i.e., `current_height` + 1) or from a future round
are placed in a separate queue (`queued`).

As specified in [the requests algorithm](requests.md#algorithm-for-sending-requests),
a node deletes the data (`RequestState`) about a sent request when the
requested information is obtained.

### Deserialization

At the very beginning, the message is checked against the [serialization
format](../serialization.md).

If any problems during deserialization are detected, a message is ignored
as something that a node can not correctly interpret. If verification is successful,
proceed to [Consensus messages processing](#consensus-messages-processing) or
[Transaction processing](#transaction-processing).

### Transaction Processing

- If the transaction is already committed, ignore it.
- If the transaction is already in the pool of unconfirmed transactions,
  ignore it.
- Add the transaction to the pool of unconfirmed transactions.
- For all known proposals in which this transaction is included, exclude the
  hash of this transaction from the list of unknown transactions. If the number
  of unknown transactions for the proposal becomes zero, proceed to [Full proposal](#full-proposal)
  state for the current proposal.

### Consensus Messages Processing

- Do not process the message if it belongs to a future round or height. In
  this case, if the message refers to the height `current_height + 1`, the
  message is added to the `queued` queue. If the message is related to the future
  height and updates the knowledge of the node about the current blockchain
  height of the message author, this information is saved according to
  [requests algorithm](requests.md).
- If the message refers to a past height, it should be ignored.
- If the message refers to the current height and any round not higher than the
  current one, then:

    - Check that the `validator_id` specified in the message is less than the total
    number of validators.
    - Check the message signature against the public key of the validator with
    index `validator_id`.

- If verification is successful, proceed to the message processing according to
  its type.

### Propose

**Arguments:** `propose`.

- If `propose.hash` is already present in the `proposes`
  hash map (i.e., the message has been processed previously), ignore the message.
- Check `propose.prev_hash` correctness.
- Check that the specified validator is the leader for the given round.
- Check that the proposal does not contain previously committed transactions
  (`Propose` messages contain only hashes of transactions, so the absence of
  hashes in the table of committed transactions is checked).
- Add the proposal to the `proposes` hash map.
- Form a list of transactions the node does not know from `propose`. [Request
  transactions](requests.md#requesttransactions) from this list.
- If all transactions are known, go to [Full proposal](#full-proposal).

### Prevote

**Arguments:** `prevote`.

- Add `prevote` to the list of known `Prevote` messages for its proposal in
  `prevote.round` round.
- If:

    - the node has formed +2/3 `Prevote` messages for the same round and `propose_hash`.
    - `locked_round < prevote.round`
    - the node knows a `Propose` message referenced by this `prevote`
    - the node knows all the transactions from the `Propose`

- Then proceed to [Availability of +2/3 Prevotes](#availability-of-23-prevotes) for
  `propose` in the round `prevote.round`

- If the node does not know the referenced `Propose` or any of its transactions,
  request them.

### Precommit

- Add the message to the list of known `Precommit`s for `propose_hash` in this
  round with the given `state_hash`.
- If:

    - the node has formed +2/3 `Precommit`s for the same round, `propose_hash`
      and `state_hash`
    - the node knows a `propose` referenced by `propose_hash`
    - the node knows all the transactions in this `propose`

- Then:

    - Execute the proposal, if it has not yet been executed.
    - Check that the node's `state_hash` coincides with the `state_hash` of the
      in the `Precommit`s. If not, stop working and signal about
      an unrecoverable error.
    - Proceed to [Commit](#commit) for this block.

- Else:

    - Request `propose`, if it is not known.
    - If the message round is bigger than `locked_round`, request `Prevote`s from
      the message round.

### Block

**Arguments:** `block`.

`Block` messages are usually requested by validators if they see that some
consensus messages belonging to a future height.

- Check the block message

    - The key in the `to` field must match the key of the node.
    - `propose.prev_hash` of the correspondent `propose` matches the hash of the
      last committed block.

- If the message structure is correct, proceed to check the block contents.

    - The block height should be equal to the current height of the node.
    - The number of `Precommit` messages from different validators
      should be sufficient to reach consensus.
    - All `Precommit` messages must be correct.

- If the check is successful, then check all transactions in the block for correctness.
  If some transactions are incorrect, stop working and signal about
  an unrecoverable error.
- Execute all transactions. If the hash of the blockchain state after the execution
  diverges from that in the `Block` message, stop working and signal about
  an unrecoverable error.

- Add the block to the blockchain and move to a new height. Set to `0` the value
  of the variable `locked_round` at the new height.

- If there are validators who claim that they are at a bigger height, then turn
  to the [request of the block from the higher height](requests.md#receiving-block).

## Timeout Processing

### Round Timeout

- If the timeout does not match the current height and round, skip further
  timeout processing.
- Add a timeout (its length is specified by `round_timeout`) for the next round.
- Process all messages from `queued`, if they become relevant (their round
  and height coincide with the current ones).
- If the node has a saved PoL, send a `Prevote` for `locked_propose` in a new round,
  and proceed to [Availability of +2/3 Prevotes](#availability-of-23-prevotes).
- Else, if the node is the leader, form and send `Propose` and `Prevote` messages
  (after the expiration of `propose_timeout`, if the node has just moved to a new
  height).

### Status Timeout

- If the node's height has not increased since the timeout was set, then broadcast
  a `Status` message to all peers.
- Add a timeout for the next `Status` broadcast.

## Stage Processing

### Full Proposal

**Arguments:** `propose`, all transactions in which are known.

- If the node does not have a saved PoL, send a `Prevote` message in the round to
  which the proposal belongs.
- For each round `r` in the interval
  `[max(locked_round + 1, propose.round), current_round]`:

    - If the node has +2/3 `Prevote`s for `propose` in `r`, then
    proceed to [Availability of +2/3 Prevotes](#availability-of-23-prevotes) for
    `propose` in `r`.

- For each round `r` in the interval `[propose.round, current_round]`:

    - If +2/3 `Precommit`s are available for `propose` in `r` and with
      the same `state_hash`, then:

        - Execute the proposal, if it has not yet been executed.
        - Check that the node's `state_hash` after applying transactions in `propose`
          coincides with the `state_hash` in the aforementioned +2/3 `Precommit`s.
          If not, stop working and signal about an unrecoverable error.
        - Proceed to [Commit](#commit) for this block.

### Availability of +2/3 Prevotes

- Cancel all requests for `Prevote`s that share `round` and `propose_hash` fields
  with the collected `Prevote`s.
- If the node's `locked_round` is less than `prevote.round` and the hash of the locked
  `Propose` message is the same as `propose_hash` in the collected `Prevote`s,
  then proceed to [Lock](#lock) for this `Propose` message.

### Lock

- For each round `r` in the interval `[locked_round, current_round]`:

    - If the node has not sent `Prevote` in `r`, send it for
      `locked_propose`.
    - If the node has formed +2/3 `Prevote`s in `r`, then change `locked_round`
      to `current_round`, `locked_propose` to `propose.hash` (`propose`
      corresponds to +2/3 `Prevote`s in `r`).
    - If the node did not send `Prevote` for any other proposal except
      `locked_propose` in subsequent rounds after `locked_round`, then:

        - Execute the proposal, if it has not yet been executed.
        - Send `Precommit` for `locked_propose` in `current_round`.
        - If the node has +2/3 `Precommit`s for the same round with the same
          `propose_hash` and `state_hash`, then proceed to [Commit](#commit).

### Commit

- Add a block to the blockchain.
- Push all the transactions from the block to the table of committed transactions.
- Increment `current_height`.
- Set the value of the variable `locked_round` to `0` at the new height.
- Delete all transactions of the committed block from the pool of unconfirmed
  transactions.
- If the node is the leader, form and send `Propose` and `Prevote` messages after
  `propose_timeout` expiration.
- Process all messages from the `queued`, if they become relevant (their round
  and height coincide with the current ones).
- Add a timeout for the next round.

## Properties

!!! note
    Formal proof of the following properties is coming in a separate white paper.

- **Safety**  
  If a non-Byzantine node adds a block to the blockchain, then no other node
  can add another block, confirmed with +2/3 `Precommit` messages, to the
  blockchain at the same height.

- **Liveness**  
  There necessarily will come a point in the system when the node adds the block
  to the blockchain.

- **Weak form of chain quality**  
  1 block out of any `F + 1` (where `F` is one third of the validators)
  sequentially committed blocks is
  guaranteed to be proposed by non-Byzantine validators. This can provide a
  certain degree of _censorship resistance_ (any correct transaction broadcasted
  to every validator would be committed eventually).

[wiki_bft]: https://en.wikipedia.org/wiki/Byzantine_fault_tolerance
[partial_ordering]: https://en.wikipedia.org/wiki/Partially_ordered_set#Formal_definition
[message_source]: https://github.com/exonum/exonum-core/blob/master/exonum/src/messages/protocol.rs
[mio_lib]: https://github.com/carllerche/mio
[partial_synchrony]: http://groups.csail.mit.edu/tds/papers/Lynch/podc84-DLS.pdf
