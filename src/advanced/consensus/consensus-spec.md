# Consensus Algorithm Specification

This article contains formal specification of [consensus algorithm](../../home/glossary.md#consensus)
in Exonum.

Consensus algorithm in Exonum is a process of reaching an agreement about order
of [transactions](../../home/glossary.md#transaction) and the result of their
execution in the presence of [Byzantine faults][wiki_bft] and [partially
synchronous](partial_synchrony) network. According to the consensus algorithm
nodes exchange [consensus messages](../../home/glossary.md#consensus-message)
authenticated with public-key crypto; these messages are processed via [a
message queue](#message-processing) and determine [transitions among
states](consensus.md#node-states-overview).

!!! tip
    See [algorithm overview](consensus.md#algorithm-overview) and [list of
    assumptions](consensus.md#assumptions) for more details.

## Global Configuration Parameters

- `propose_timeout`  
  Proposal timeout after the new height beginning.

- `round_timeout`  
  Interval between rounds.

- `status_timeout`  
  Period of sending a `Status` message.

## Node State Variables

- `current_height`  
  Current blockchain height.

- `queued`  
  Queue for consensus messages (`Propose`, `Prevote`, `Precommit`) from the
  future height or round.

- `proposes`  
  HashMap with known block proposals.

- `locked_round`  
  Round in which the node has [locked](consensus.md#locks) on a proposal.

- `current_round`  
  Number of current round.

- `locked_propose`  
  `Propose` on which node is locked.

- `state_hash`  
  Hash of blockchain state.

## Consensus messages and their fields

The consensus algorithm uses following types of messages:
[`Propose`](consensus.md#propose), [`Prevote`](consensus.md#prevote),
[`Precommit`](consensus.md#precommit), [`Status`](consensus.md#status),
[`Block`](consensus.md#block). Only part of their fields is described here. See
[source code][message_source] for more details.

- `validator_id`  
  Index of specific validator in `validators` list of configuration. This field
  is common to all types of messages.

- `height`  
  Height to which the message is related. This field is common to all types of
  messages.

- `round`  
  Round number to which the message is related. This field is common to all
  types of messages.

- `hash`  
  Hash of the message. This method is common to all types of messages.

- `propose`  
  The `Propose` message being processed.

- `propose.prev_hash`
  Hash of the previous block.

- `prevote`  
  The `Prevote` message being processed.

- `prevote.propose_hash`  
  Hash of the `Propose` message to which `prevote` belongs.

## Definitions

The definitions from the [general description of consensus algorithm](consensus.md)
are used.

In the following description, +2/3 means more than two thirds of the validators,
and -1/3 means less than one third.

### Pool of Unconfirmed Transactions

Each node has a set of transactions that have not yet been added to the
blockchain. This set is called _pool of unconfirmed transactions_. In general,
the pools of unconfirmed transactions are different for different nodes. If
necessary, the nodes can request unknown transactions from other nodes.

### Proof-of-Lock

A set of +2/3 `Prevote` votes for the same proposal from the nodes at current
round and blockchain height is called _Proof-of-Lock (PoL)_.  Nodes store PoL as
part of node state. The node can have no more than one stored PoL. We say that
PoL is greater than recorded one (has a higher priority), in cases when 1) there
is no PoL recorded 2) the recorded PoL corresponds to a proposal with a smaller
round number. So PoLs are [partially ordered][partial_ordering]. A node must
replace the stored PoL with a greater PoL if it is collected by the node during
message processing.

## Message Processing

Node uses queue based on [the Mio library][mio_lib] for message processing.
Incoming request and consensus messages are placed in this queue when they are
received. The same queue is used for timeouts processing.

Messages from the next height (i.e., `current_height` + 1) or future round are
placed in the separate queue (`queued`).

As specified in [requests algorithm](requests.md#algorithm-for-sending-requests),
node deletes stored data (`RequestState`) about sent request when the
requested info is obtained.

The timeout is implemented as a message to this node itself. This message is
queued and processed when it reaches its queue.

**TODO:** insert picture

## Algorithm Description

### Consensus Algorithm Stages

- [Full proposal](#full-proposal) (availability of full proposal)  
  Occurs when the node gets complete info about some proposal and all the
  transactions from that proposal.
- [Availability of +2/3 Prevote](#availability-of-23-prevote)  
  Occurs when node collects +2/3 `Prevote` messages from the same round for the
  same known proposal.
- [LOCK](#lock)  
  Occurs when the node replaces [the stored PoL](#proof-of-lock) (or collects
  its first PoL).
- [COMMIT](#commit)  
  Occurs when the node collects +2/3 `Precommit` messages for the same round for
  the same known proposal. Corresponds to [the Commit node state](consensus.md#node-states-overview).

### Receiving an incoming message

At the very beginning, the message is checked against the [serialization
format](../serialization.md).

If any problems during deserialization are detected, such a message is ignored
as something that a node can not correctly interpret. If verification is successful,
proceed to [Consensus messages processing](#consensus-messages-processing) or
[Transaction processing](#transaction-processing).

### Consensus messages processing

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

### `Propose` Message Processing

**Arguments:** `propose`.

- If `propose` is known (its hash already is in the `proposes`
  HashMap), ignore the message.
- Check `propose.prev_hash` correctness.
- Check that the specified validator is the leader for the given round.
- Check that the proposal does not contain any previously committed transaction
  (`Propose` message contain only hashes of transactions, so the absence of
  hashes in the table of committed transactions is checked).
- Add the proposal to the `proposes` HashMap.
- Form a list of transactions the node does not know from `propose`. [Request
  transactions](requests.md#requesttransactions) from this list.
- If all transactions are known, go to [Full proposal](#full-proposal).

### Transaction processing

- If the transaction is already committed, ignore the message.
- If such a transaction is already in the pool of unconfirmed transactions,
  ignore the message.
- Add the transaction to the unconfirmed transaction pool.
- For all known proposals in which this transaction is included, exclude the
  hash of this transaction from the list of unknown transactions. If the number
  of unknown transactions becomes zero, proceed to [Full proposal](#full-proposal)
  for current proposal.

### Full proposal

**Arguments:** `propose`.

- If the node does not have a saved PoL, send `Prevote` message in the round to
  which the proposal belongs.
- For each round `r` in the interval
  `[max(locked_round + 1, propose.round), current_round]`:

    - If the node has +2/3 `Prevote` for `propose` in `r`, then
    proceed to [Availability of +2/3 Prevote](#availability-of-23-prevote) for
    `propose` in `r`.

- For each round `r` in the interval `[propose.round, current_round]`:

    - If +2/3 `Precommit` аrе available for `propose` in `r` and with
      the same `state_hash`, then:

        - Execute the proposal, if it has not yet been executed.
        - Check that the node's `state_hash` coincides with the `state_hash` of the
          majority (if not, the node must stop working and signalize error).
        - Proceed to [COMMIT](#commit) for this block.

### Availability of +2/3 `Prevote`s

- Cancel all requests for `Prevote`s that share `round` and `propose_hash` fields
  with the collected `Prevote`s.
- If the node's `locked_round` is less than `prevote.round` and the hash of the locked
  `Propose` message corresponding to this `prevote` is the same as `prevote.propose_hash`,
  then proceed to [LOCK](#lock) for this very proposal.

### `Prevote` Message Processing

**Arguments:** `prevote`.

- Add `prevote` to the list of known `Prevote` messages for its proposal in
  `prevote.round` round.
- If:

    - the node has formed +2/3 `Prevote` messages for the same round and `propose_hash`.
    - `locked_round < prevote.round`
    - the node knows `propose` corresponding to this `prevote`
    - the node knows all of its transactions

- Then proceed to [Availability of +2/3 Prevote](#availability-of-23-prevote) for
  `propose` in the round `prevote.round`

- If the node does not know `propose` or any transactions, request them.

### `Precommit` Message Processing

- Add the message to the list of known `Precommit` for `propose` in this
  round with the given `state_hash`.
- If:

    - the node has formed +2/3 `Precommit` for the same round and `propose_hash`.
    - the node knows `propose`
    - the node knows all of its transactions

- Then:

    - Execute the proposal, if it has not yet been executed.
    - Check that the node's `state_hash` coincides with the `state_hash` of the
      majority.
    - Proceed to [COMMIT](#commit) for this block.

- Else:

    - Request `propose`, if it is not known.
    - If the message round is bigger than `locked_round`, request `Prevote`s from
      the message round.

### LOCK

- For each round `r` in the interval `[locked_round, current_round]`:

    - If the node has not sent `Prevote` in `r`, send it for
      `locked_propose`.
    - If the node has formed +2/3 `Prevote` in `r`, then change `locked_round`
      to `current_round`, `locked_propose` to `propose.hash` (`propose`
      corresponds to +2/3 `Prevote` in `r`).
    - If the node did not send `Prevote` for any other proposal except
      `locked_propose` in subsequent rounds after `locked_round`, then:

        - Execute the proposal, if it has not yet been executed.
        - Send `Precommit` for `locked_propose` in `current_round`.
        - If the node has 2/3 `Precommit`, then proceed to [COMMIT](#commit).

### COMMIT

- Add block to the blockchain.
- Push all the transactions from the block to the table of committed transactions.
- Update current height.
- Set the value of the variable `locked_round` to `0` at the new height.
- Delete all transactions of the committed block from the pool of unconfirmed
  transactions.
- If the node is the leader, form and send `Propose` and `Prevote` messages after
  `propose_timeout` expiration.
- Process all messages from the `queued`, if they become relevant (their round
  and height coincide with the current ones).
- Add a timeout for the next round of new height.

### `Block` Message Processing

**Arguments:** `propose`.

`Block` messages are usually requested by validators if they see that some
consensus messages belonging to a future height.

- Check the block message

    - The key in the `to` field must match the key of the node.
    - `propose.prev_hash` of the correspondent `propose` matches the hash of the
      last committed block.

- If the message structure is correct, proceed to check the block contents.

    - The block height should be equal to the current height of the node.
    - The number of `Precommit` messages should be sufficient to reach consensus.
    - All `Precommit` messages must be correct.

- If the check is successful, then check all transactions for correctness and if
  they are all correct, then proceed to their execution, which results in
  `Block` (if not all transactions are correct, the node must stop working and
  signalize error). Its hash must coincide with the hash of the block from the
  message, if this did not happen, then this is an indication of a critical
  failure: either the majority of the network is byzantine or the nodes' software
  is corrupted.

- Add the block to the blockchain and move to a new height. Set to `0` the value
  of the variable `locked_round` at the new height.

- If there are validators who claim that they are at a bigger height, then turn
  to the [request of the block from the higher height](requests.md#receiving-block).

### Round timeout processing

- If the timeout does not match the current height and round, skip further
  timeout processing.
- Add a timeout (its length is specified by `round_timeout`) for the next round.
- Process all messages from the `queued`, if they become relevant (their round
  and height coincide with the current ones).
- If the node has a saved PoL, send `Prevote` for `locked_propose` in a new round,
  proceed to [Availability of +2/3 Prevote](#availability-of-23-prevote).
- Else, if the node is the leader, form and send `Propose` and `Prevote` messages
  (after the expiration of `propose_timeout`, if the node has just moved to a new
  height).

### Status timeout processing

- If the node's height has not changed since the timeout was set, then send out
  a `Status` message to all validators.
- Add a timeout for the next `Status` send.

[wiki_bft]: https://en.wikipedia.org/wiki/Byzantine_fault_tolerance
[partial_ordering]: https://en.wikipedia.org/wiki/Partially_ordered_set#Formal_definition
[message_source]: https://github.com/exonum/exonum-core/blob/master/exonum/src/messages/protocol.rs
[mio_lib]: https://github.com/carllerche/mio
[partial_synchrony]: http://groups.csail.mit.edu/tds/papers/Lynch/podc84-DLS.pdf
