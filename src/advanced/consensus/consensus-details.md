# Details of Consensus Algorithm

This article contains [formal specification](#algorithm-specification) of
[consensus algorithm](consensus.md) in Exonum and [proofs of consensus algorithm
correctness](proof-of-algorithm-correctness)

## Algorithm Specification

### Global Configuration Parameters

- `propose_timeout`  
  Proposal timeout after the new height beginning.

- `round_timeout`  
  Interval between rounds.

- `status_timeout`  
  Period of sending a `Status` message.

### Node State Variables

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

### Consensus messages and their fields

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

### Definitions

The definitions from the [general description of consensus algorithm](consensus.md)
are used.

Each node has a set of transactions that have not yet been added to the
blockchain. This set is called _pool of unconfirmed transactions_. In general,
the pools of unconfirmed transactions are different for different nodes. If
necessary, the nodes can request unknown transactions from other nodes.

A set of +2/3 `Prevote` votes for the same proposal from the nodes at current
round and blockchain height is called _Proof-of-Lock (PoL)_.  Nodes store PoL as
part of node state. The node can have no more than one stored PoL. We say that
PoL is greater than recorded one (has a higher priority), in cases when 1) there
is no PoL recorded 2) the recorded PoL corresponds to a proposal with a smaller
round number. So PoLs are [partially ordered][partial_ordering]. A node must
replace stored PoL with a greater one.

As specified in [requests algorithm](requests.md#algorithm-for-sending-requests),
node deletes stored data (`RequestState`) about sent request when the the
requested info is obtained.

The timeout is implemented as a message to this node itself. This message is
queued and processed when it reaches its queue.

**TODO:** insert picture

### Algorithm Description

Let us explain in more detail the transitions between states.

#### Receiving an incoming message

At the very beginning, the message is checked against the [serialization
format](../serialization.md).

If any problems during deserialization are detected, such a message is ignored
as something that we can not correctly interpret. If verification is successful,
proceed to **Consensus messages processing** or **Transaction processing**.

#### Consensus messages processing

- Do not process the message if it belongs to a future round or height. In
  this case, if the message refers to the height `current_height + 1`, the
  message is added to the `queued` queue. If the message is related to the future
  height and updates the knowledge of the node about the current blockchain
  height of the message author, this information is saved according to
  [requests algorithm](requests.md).
- If the message refers to a lesser height, it should be ignored.
- If the message refers to the current height and any round not higher than the
  current one, then:

  - Check that the `validator_id` specified in the message is less than the total
  number of validators.
  - Check the message signature against the public key of the validator with
  index `validator_id`.

- If verification is successful, proceed to the message processing according to
  its type.

#### `Propose` Message Processing

**Arguments:** `propose`.

- If `propose` is known (its hash already is in the `proposes`
  HashMap), ignore the message.
- Check `propose.prev_hash` correctness.
- Check that the specified validator is the leader for the given round.
- Check that the proposal does not contain any previously committed transaction
  (`Propose` message contain only hashes of transactions, so the absence of hashes in the
  database of committed transactions is checked).
- Add the proposal to the `proposes` HashMap.
- Form a list of transactions the node does not know from this proposal. Request
  transactions from this list.
- If all transactions are known, go to **Full proposal**.

#### Transaction processing

- If the transaction is already committed, ignore the message.
- If such a transaction is already in the pool of unconfirmed transactions,
  ignore the message.
- Add the transaction to the unconfirmed transaction pool.
- For all known proposals in which this transaction is included, exclude the
  hash of this transaction from the list of unknown transactions. If the number
  of unknown transactions becomes zero, proceed to **Full Proposal** for current
  proposal.

#### Full proposal

**Arguments:** `propose`.

- If the node does not have a saved PoL, send `Prevote` message in the round to
  which the proposal belongs.
- For all rounds in the interval
  `[max(locked_round + 1, propose.round), current_round]`:

  - If the node has +2/3 `Prevote` for this proposal in this round, then proceed to
  **Availability of +2/3 `Prevote`** for this proposal in this round.

- For all rounds in the interval `[propose.round, current_round]`:

  - If +2/3 `Precommit` аrе available for this proposal in this round and with
    the same `state_hash`, then:

    - Execute the proposal, if it has not yet been executed.
    - Check that the node's `state_hash` coincides with the `state_hash` of the
      majority (if not, the node must stop working and signalize error).
    - Proceed to **COMMIT** for this block.

#### Availability of +2/3 `Prevote`

**Arguments:** `prevote`.

- Cancel all requests for `Prevote`s that share `round` and `propose_hash` fields
  with the collected `Prevote`s.
- If the node's `locked_round` is less than `prevote.round` and the hash of the stored
  `Propose` message corresponding to this `prevote` is the same as `prevote.propose_hash`,
  then proceed to **LOCK** for this very proposal.

#### `Prevote` Message Processing

**Arguments:** `prevote`.

- Add `prevote` to the list of known `Prevote` messages for its proposal in
  `prevote.round` round.
- If:

  - the node has formed +2/3 `Prevote` messages for the same round and `propose_hash`.
  - `locked_round < prevote.round`
  - the node knows this proposal
  - the node knows all of its transactions

- Then proceed to **Availability of +2/3 `Prevote`** for this proposal in
  the round `prevote.round`

- If the node does not know `propose` or any transactions, request them.

#### `Precommit` Message Processing

- Add the message to the list of known `Precommit` for this proposal in this
  round with the given `state_hash`.
- If:

  - the node has formed +2/3 `Precommit` for the same round and `propose_hash`.
  - the node knows this proposal
  - the node knows all of its transactions

- Then:

  - Execute the proposal, if it has not yet been executed.
  - Check that the node's `state_hash` coincides with the `state_hash` of the
    majority.
  - Proceed to **COMMIT** for this block.

- Else:

  - Request `propose`, if it is not known.
  - If the message round is bigger than `locked_round`, request `Prevote`s from
    the message round.

#### LOCK

- For all rounds in the interval `[locked_round, current_round]`:

  - If the node has not sent `Prevote` in this round, send it for `locked_propose`.
  - If the node has formed +2/3 `Prevote` in this round, then execute **LOCK** for
    this round and `locked_propose`, assign `locked_round` to `current_round`.
  - If the node did not send `Prevote` for other proposals in subsequent rounds
    after `locked_round`, then:

    - Execute the propoasl, if it has not yet been executed.
    - Send `Precommit` for `locked_propose` in this round.
    - If the node has 2/3 `Precommit`, then proceed to **COMMIT**.

#### COMMIT

- Delete `RequestState` for  `RequestPrecommits`, if there was one.
- Push all the transactions from the block to the storage.
- Update current height.
- Set the value of the variable `locked_round` to `0` at the new height.
- Delete all transactions of the committed block from the pool of unconfirmed
  transactions.
- If the node is the leader, form and send `Propose` and `Prevote` messages after
  `propose_timeout` expiration.
- Process all messages from the `queued`, if they become relevant.
- Add a timeout for the next round of new height.

#### `Block` Message Processing

**Arguments:** `propose`.

Only for the case if a validator is behind the majority of the network:

- Check the block message

  - The key in the `to` field must match the key of the validator.
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

- Add the block to the blockchain and move to a new height. Set to`0` the value
  of the variable `locked_round` at the new height.

- If there are validators who claim that they are at a bigger height, then turn
  to the request of the block from the higher height.

#### Round timeout processing

- If the timeout does not match the current height and round, skip further
  timeout processing.
- Add a timeout (its length is specified by `round_timeout`) for the next round.
- If the node has a saved PoL, send `Prevote` for `locked_propose` in a new round,
  check if the node has reached the status of **Availability of +2/3 `Prevote`**.
- Else, if the node is the leader, form and send `Propose` and `Prevote` messages
  (after the expiration of `propose_timeout`, if the node has just moved to a new
  height).
- Process all messages from the queue, if they become relevant.

#### Status timeout processing

- If the node has at least one accepted block, then send out a `Status` message
  to all validators.
- Add a timeout for the next `Status` send.

## Proof of Algorithm Correctness

In this version, we assume that messages are processed instantly. To get rid of
this assumption, it is enough to guarantee the finality of the processed messages
pertaining to each round, and the correct organization of the queue for messages
from different rounds.

### Proposition 1: Round Beginning

All non-Byzantine nodes being at a height of not less than `H`, will be in the
state `(H, R)`or higher (either bigger round or bigger height), where `R` is an
arbitrary fixed constant.

#### Proof

We will prove the statement above for every single non-Byzantine node. That node
shall move to a new height in a finite time (and in this case the condition will
be satisfied) or remain at the height `H`. In the second case, the node
increments the round counter at fixed intervals (by stopwatch). From the fact
that the transition to a new round is carried out for a limited time `T` it
follows that the round counter of any non-Byzantine validator will be increased
to the value `R` no more than in finite time `R * T`.

Thus, all non-Byzantine validators will move to the state `(H, R)` or higher.

### Proposition 2: Non-Byzantine Leader

For each height `H` there exists a round in which the non-Byzantine node will
become the leader.

#### Proof

**TODO:** Property of round robin.

### Proposition 3: Deadlock Absence

A certain non-Byzantine node will sooner or later send some message relating to
the consensus algorithm (`Propose`, `Prevote`, `Precommit`).

#### Proof

Let us prove it by contradiction. Assume that each non-Byzantine node send no
messages for an arbitrarily long period of time; then that node updates neither
the current height nor the PoL state (`Prevote` message would be sent for the
new PoL upon the coming of a new round in the case of a PoL update, if no other
message had been sent before this time). Consider the cases of PoL status:

1. **Some non-Byzantine node has a saved PoL**. Then this node will send a
  `Prevote` message for the proposal saved in the PoL when the next round
  timeout occurs (unless it sends any other message earlier).

2. **No one non-Byzantine node has a saved PoL**. Then there will always come
  another round in which some non-Byzantine node will be the leader (see the
  previous statement). In this case, the node will form a new proposal and send
  `Propose` and `Prevote` messages.

#### Consequence

If there exists an unlimited number of heights on which the
validator can become a leader (property of round robin), then any non-Byzantine
node will send an arbitrarily large number of messages related to the consensus
algorithm (`Propose`, `Prevote`, `Precommit`).

### Proposition 4: Obligatory Block Acceptance (Liveness)

There necessarily will come a point in the system when the node adds the block
to the blockchain.

#### Proof

Suppose the network be at a certain height `H`; then the maximum height of a
non-Byzantine nodes' blockchain is equal to `H`. In accordance with the
proposition 3, all non-Byzantine nodes will be able to move up to the height `H`
(**TODO** state a separate consequence after proposition 3). Next, the state is
considered when all the non-Byzantine nodes are at the height `H`.

Let `R(T)` denote the round following the maximum round with non-Byzantine
validators, at the moment `T` by the clock of an outside observer.

Similarly, `T(R)` is the time of coming of the `R` round by the clock of an
outside observer for all non-Byzantine validators.

Let the non-Byzantine node be the leader for the first time in the round with
the number `R < R*` (where `R*` denote a uniform estimate **TODO** explain of `R`).
Then the coming time of the round `R*` for all non-Byzantine nodes on the
outside observer's watch is `T(R*)`.

Not later than at the moment `T(R*) + \delta T + propose_timeout` each
non-Byzantine node will receive a correct proposal from the `R` round. Further,
not later than through `2 \delta T`, that node will know all the transactions
from this proposal (request mechanism). Denote this time
`T* = T(R*) + propose_timeout + 3 \delta T`.

If no non-Byzantine node has PoL to the `R(T*)` round, then in this round the
node will receive PoL (for the proposal from the `R` round). Indeed, if no one
has PoL, then the nodes could not send the `Prevote` message in the `R(T*)`
round. In accordance with the algorithm for processing complete proposals, the
confirming `Prevote` message will be sent.

Thus, **by the time `T'= T(R(T*)) + \delta T` at least one non-Byzantine node
will have PoL**.

**Not later than `T'' = T(R(T')) + 2 \delta T` each non-Byzantine node will have
some PoL**. Indeed, starting with the `R(T')` round, the non-Byzantine node will
send `Prevote` messages for the proposal from its PoL. Non-Byzantine nodes that
do not have PoL will be able to get this PoL through the request mechanism by
the time `T''`.

None of the non-Byzantine nodes will send `Prevote` for new proposals since the
moment `T''`. Hence, new PoL will not appear in the network.

During one iteration `T(R(...)) + 2 \delta T` at least one non-Byzantine
validator will increase its PoL. Indeed, all the non-Byzantine nodes already
have some PoLs. In this case, they will always send `Prevote` messages for the
corresponding proposals. And according to the logic of their processing, if the
non-Byzantine node receives `Prevote` pointing to a larger PoL, a request for
missing `Prevote` for this (bigger) PoL occurs.

Since there exists finite number of the validators and possible proposals, it
follows that in some finite time `T '''` +2/3 of all validators will receive
PoL for the same proposal. After that they will be able to send `Precommit`
messages.

Not later than time `T(R(T''')) + \delta T` at least one non-Byzantine validator
will accept the new block and hence some node will correctly add the block to
the blockchain.

### Proposition 5: Absence of Forks (Consensus Finality)

If some non-Byzantine node adds a block to the blockchain, then no other node
can add another block, confirmed with +2/3 precommit messages, to the blockchain
at the same height.

#### Proof

Let some node added the `B` block to the blockchain. This could only happen if
that node went into the **COMMIT** state. There exist three possibilities of the
transition to the **COMMIT** state: from **LOCK**, **`Prevote` processing**,
and **Full Proposal**. In all these cases, the condition of
the transition is the presence of +2/3 `Precommit` messages for some proposal `P`
from the `R` round and the result of applying the corresponding block leads to
the same `state_hash`. Since the number of Byzantine nodes is -1/3, +1/3 of the
non-Byzantine nodes sent `Precomit` messages in the corresponding round. Such a
message could only be sent within the **LOCK** state in which the PoL was stored
for the `P` proposal in the `R` round. This could happen only if these nodes did
not send `Prevote` messages in rounds `R '> R` for `P'! = P` (special condition
for sending the `Precommit` message). Also, these nodes sent `Prevote` messages
in all rounds after `R` until their current rounds. Thus, since the remaining
nodes are -2/3, we have two consequences.

1. In no rounds after `R` we can get PoL (in other words go to the **LOCK**
  state) for the `P '! = P` proposal, because this requires +2/3 `Prevote`
  messages.

2. In all rounds of `R '> R`, new PoLs cannot emerge in the network, except for
  PoLs related to the `P` proposal (and, accordingly, to the `B` block). Indeed,
  at the beginning of the round following the current round, the specified +1/3
  of the non-Byzantine nodes will be in the state with the saved PoL
  corresponding to the `P` proposal. And consequently they will send `Prevote`
  messages only for the saved `P` proposal according to the **Processing of the
  timeout of the round** state.

Thus, messages of `Precommit` type can not be sent for any other block. This
means that none of the non-Byzantine node can add another block to the blockchain.

#### Corollary

The property of fork absence will be preserved also in the case
of an asynchronous network .

#### Proof

The proof of **Proposition 5** did not in any way use the assumption of partial
synchronism. Therefore, it is also true in an asynchronous network.

### Proposition 6: Moving Nodes Up

Any non-Byzantine node can get all the blocks included in the blockchain by any
other non-Byzantine node.

#### Proof

Let the `A` node fall behind for some reason from the`B` node. And the `A` node
is at the height `H`, while the `B` node is at the height `H + h`. We will show
that in a finite time the `A` node can be pulled to the height `H + 1`.

All messages described in the algorithm and related to the consensus algorithm
(`Propose`, `Prevote`, `Precommit`, `Status`) contain the current height. Thus,
as soon as the `B` node sends any of these messages and the message is delivered
to `A`, the `A` node will understand that it is behind and will request the next
block (it can do this not at the `B` node, but at any other node; if the block
is added, then the block will be correct due to absence of forks (proposition 5)).
In accordance with the corollary from proposition 3 (deadlock absence), the `B`
node always sends some message of consensus algorithm .

### Proposition 7: Censorship Resistance

Not less than once in `1/3` blocks the non-Byzantine node will be the leader of
the accepted block.

#### Proof

**TODO:** Property of a new algorithm for choosing a leader.

[partial_ordering]: https://en.wikipedia.org/wiki/Partially_ordered_set#Formal_definition
[message_source]: https://github.com/exonum/exonum-core/blob/master/exonum/src/messages/protocol.rs
