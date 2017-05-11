# Consensus in Exonum

This consensus algorithm is based on the [algorithm proposed in
Tendermint][tendermint_consensus].
**TODO:** Expand the intro

## Assumptions and definitions

- Hereinafter, we will call the **consensus algorithm** the process of
obtaining an agreed result by a group of participants. In this system the
consensus algorithm is used to obtain the next block, which will be added to the
blockchain.
- It is assumed that not all the nodes of the blockchain network are involved in
the consensus algorithm, but only the specialized validating nodes (**TODO:**
decide which naming is better: validating nodes or consensus nodes)
(validators). The identities of validators are known; e.g., in a [consortium
blockchain][public_and_private_blockchains] validators could be controlled by
companies participating in the consortium. The code that runs on all the
validators is identical. There are no single points of failure.
- It is assumed that the processors of the validators are [partially
synchronous][partial_synchrony] (difference in their performances does not
exceed an unknown and finite number `F` times) and the network is partially
synchronous. (time for message delivery does not exceed the unknown time `t`)
- Each validator uses its own **stopwatch** to determine the time.
- The process of reaching consensus on the next block (at the height `H`)
consists of several **rounds**, numbered from 1\. Rounds may start in different
time for different validators. The stopwatch starts counting from zero once the
validator moves to a new height `H`. The onset of the next round is determined
by a fixed timetable: rounds start after regular intervals. In each round a
leader node is chosen. Leader node offers a proposal for the next block. The
logic of selecting the leader node is described in the separate algorithm.
(**TODO:** insert link to leader election algorithm)
- When the round `R` comes, the previous rounds are not completed: round `R` for
the validator means that validator can process messages related to a round with
a number no greater than `R`.
- We will call the current state of the validating node `(H, R)`, meaning the
height `H` and the round `R` of negotiations for the next block acceptance.
- Validating nodes exchange messages. The consensus algorithm uses several types
of messages:

  1. _Propose_ - a set of transactions to include in the block (message includes
  not whole transactions but only transaction hashes). If the behavior is
  correct, it is sent only by the leader node of the round.
  2. _Prevote_ - voting message, indicating that the node has a correctly formed
  proposal and all the transactions specified in it. To be distributed by all
  nodes.
  3. _Precommit_ - message expressing readiness to include the next block into
  blockchain. To be distributed by all nodes.
  4. _Status_ - information message about the current height. It is sent with a
  periodicity written in the `status_timeout` variable (consensus parameter).
  5. _Block_ - message containing a block (in the meaning of blockchain) and a
  set of _precommit_ messages that allowed that block to be accepted. To be sent
  on request.
  6. _Request_ - request message for receiving certain information. Such
  requests are sent to receive unknown information to nodes that signal its
  presence (for example, messages are sent from heights greater than the current
  node height - the case of a lagging node). Sending and processing of such
  messages is algorithmized (**TODO:** insert link to request algorithm). The
  algorithm for sending requests is an integral part of the consensus algorithm.

- +2/3 means "more than 2/3", and -1/3 means less than one third.

- A set of +2/3 votes from _prevote_ state `(H, R)` will be called
_Proof-of-Lock_ (_PoL_). Nodes should store PoL. The node can have no more than
one stored PoL.

- We will say that PoL is more than recorded one (has a higher priority), in
cases when 1) there is no PoL recorded 2) the recorded PoL corresponds to a
proposal with a smaller round number. So PoLs are [partially
ordered][partial_ordering].

- Some ordered numbering of validators (validator id) from 0 to N-1 exists and
it is known to all network members. When moving to a new height, the validator
number may change due to a change in the list of validating nodes.

- Nodes receive and exchange among themselves transactions that need to be added
to the blockchain. Each node has a set of transactions that have not yet been
added to the blockchain. This set will be called **pool of unconfirmed
transactions** . In general, the pools of unconfirmed transactions are different
for different nodes. If necessary, the nodes can request unknown transactions
from other nodes. We will also refer to the transaction added to the blockchain
in one of the previous blocks as **committed**.

## Node states overview

The order of states in the proposed algorithm is as follows:

```
Commit -> (Round)+ -> Commit -> ...
```

So on the timeline, these states look like this (for one of the
validator nodes):

```
Commit: |  H  |                       | H+1 |               | H+2 |                              ...
Round1: |     | R1                    |     | R1            |     | R1                           ...
Round2: |          | R2               |          | R2       |          | R2                      ...
Round3: |               | R3          |               | R3  |               | R3                 ...
Round4: |                    | R4     |                    ||                    | R4            ...
...
--------------------------------------------------------------------------------------------->  Time
```

Note that rounds have a fixed start time but they do not have a definite end
time (they end when the next block is received). This differs from the
Tendermint algorithm, in which rounds are closed periods of time (messages
marked with the round `R` are sent and received only during the round `R`).

## Algorithm operation

**TODO:** insert picture

Let us explain in more detail the transitions between states.

**Receiving an incoming message**

At the very beginning, the correctness of the received message is checked:

- The length of the message is greater than 40 bytes (header + signature).
- The network identifier corresponds to the network in which we operate.
- The protocol version is known to us.
- The message type is known.
- The size of the message body is not less than the minimum possible size.
- Any boolean fields are either 0 or 1.
- Any string values are valid UTF-8 strings.
- Pointers to segments always precede the segments themselves.
- The segment does not exceed the limits of the message.

If any of the above problems are detected, such a message is ignored as
something that we can not correctly interpret. If everything is OK, proceed to
**Consensus messages processing** or **Transaction processing**.

**Consensus messages processing**

- We do not process the message if it belongs to a future round or height. In
this case, if the message refers to the height no greater than
`current_height + y`, where `y` is some small natural number, the message is
added to the `queued` queue. If the message is related to the future height and
includes updated information about the validator (validator current height),
this information is saved.
- If the message refers to the previous height, it should be ignored.
- If the message refers to the current height and any round not higher than the
current one, then:

  - Check that the `validator_id` specified in the message is less than the
  total number of validators.
  - Check the message signature.

- If everything is OK, proceed to the message processing according to its type.

**_Propose_** **message processing**

- If we already know this proposal, ignore the message.
- Check `prev_hash` (the hash of the previous block) correctness.
- Check `time` (block formation time) correctness.
- Make sure that the specified validator is the leader for the given round.
- Make sure that the proposal does not contain any previously committed
transaction.
- Add the proposal to the `proposes` structure
- Form a list of transactions we do not know from this proposal.
- If all transactions are known, go to **Availability of the full proposal**.

**Transaction processing**

- If the transaction is already committed, ignore the message.
- If such a transaction is already in the pool of unconfirmed transactions,
ignore the message.
- Add the transaction to the unconfirmed transaction pool.
- For all known proposals in which this transaction is included, exclude the
hash of this transaction from the list of unknown transactions. If the number of
unknown transactions becomes zero, proceed to **Availability of the full
proposal** for current proposal.

**Availability of the full proposal**

- If we do not have a saved PoL, send _prevote_ in the round to which the
proposal belongs.
- For all rounds in the interval `[max(locked_round + 1, propose.round),
current_round]`:

  - If we have +2/3 _prevote_ for this proposal in this round, then proceed to
  **Availability of +2/3** **_Prevote_** for this proposal in this round.

- For all rounds in the interval `[propose.round, current_round]`:

  - If +2/3 _precommit_ аrе available for this proposal in this round and with
  the same `state_hash`, then:

    - Execute the block, if it has not yet been executed.
    - Маке sure that our `state_hash` coincides with the `state_hash` of the
    majority.
    - Proceed to ** COMMIT ** for this block.

**Availability of +2/3** **_Prevote_**

- Delete **Prevotes** request, if available for `prevote.round` and
`propose_hash`
- If our `locked_round` is less than `prevote.round` and the hash of the stored
`propose` is the same as `prevote.propose_hash`, then proceed to **LOCK** for
this very proposal.

**_Prevote_** **message processing**

- Add the message to the list of known _prevote_ for this proposal in this
round.
- If:

  - we have formed +2/3 _prevote_
  - `locked_round < prevote.round`
  - we know this proposal
  - we know all of its transactions

- Then proceed to **Availability of + 2/3** **_ Prevote _** for this proposal in
the round `prevote.round`

- If we do not know `Propose` or any transactions, request them.

**_Precommit_** **message processing**

- Add the message to the list of known _precommit_ for this proposal in this
round with the given `state_hash`.
- If:

  - we have formed +2/3 _precommit_
  - we know this proposal
  - we know all of its transactions

- Then:

  - Execute the block, if it has not yet been executed.
  - Make sure that our `state_hash` coincides with the `state_hash` of the
  majority.
  - Proceed to ** COMMIT ** for this block.

- Else:

  - Request _propose_, if it is not known.
  - If the message round is bigger than `locked_round`, request _prevotes_ per
  round from the message.

**_LOCK_**

- For all rounds in the interval `[locked_round, current_round]`:

  - If we have not sent _prevote_ in this round, send it for `locked_propose`.
  - If we have formed +2/3 _prevote_ in this round, then execute ** LOCK ** for
  this round and `locked_propose`, assign` locked_round` to `current_round`.
  - If we did not send _prevote_ messages such that `prevote.hash! =
  Locked_propose`, in rounds>` locked_round` (that is, if we did not vote
  _prevote_ for other proposals in subsequent rounds after `locked_round`),
  then:

    - Execute the block, if it has not yet been executed.
    - Send _precommit_ for `locked_propose` in this round.
    - If we have 2/3 _precommit_, then proceed to **COMMIT**.

**_COMMIT_**

- Remove `precommits` request, if there was one.
- Push all the changes to the storage.
- Update current height.
- Set the value of the variable `locked_round` to `0` at the new height.
- Delete all transactions of the committed block from the pool of unconfirmed
transactions.
- If we are the leader, form and send _propose_ and _prevote_ after
`propose_timeout` expiration.
- Process all messages from the queue, if they become relevant.
- Add a timeout for the next round of new height.

**_Block_** **message processing**

- Check the block message

  - The key in the `to` field must match the key of the validator.
  - The time of  the block creating must fit within the interval
  `0 <= (current_time - block.time) <= BLOCK_ALIVE`
  - `block.prev_hash` matches the hash of the last committed block.

- If the message is compiled correctly, proceed to check the block contents.

  - The block height should be equal to the current height of the node.
  - The time for the block creation must fit into the intervals of the
  corresponding round.
  - The number of _precommit_ messages should be sufficient to reach consensus.
  - All _precommit_ messages must be correct.

- If the check is successful, then check all transactions for correctness and if
they are all correct, then proceed to their execution, which results in `block`.
Its hash must coincide with the hash of the block from the message, if this did
not happen, then terminate the work of the node.

- Add the block to the blockchain and move to a new height.  Set to` 0` the
value of the variable `locked_round` at the new height.

- If there are validators who claim that they are at a bigger height, then turn
to the request of the block from the higher height.

**Round timeout processing**

- If the timeout does not match the current height and round, ignore it.
- Add a timeout for the next round.
- If we have a saved PoL, send _prevote_ for `locked_propose` in a new round,
checking if we have reached the status of **Availability of + 2/3**
**_ Prevote _**.
- ELSE, if we are the leader, form and send _propose_ and _prevote_ after the
expiration of `propose_timeout`.
- Process all messages from the queue, if they become relevant.

**Status timeout processing**

- If the node has at least one received block, then send out a status message to
all validators.
- Add a timeout for the next status send.

[partial_ordering]: https://en.wikipedia.org/wiki/Partially_ordered_set#Formal_definition
[partial_synchrony]: http://groups.csail.mit.edu/tds/papers/Lynch/podc84-DLS.pdf
[public_and_private_blockchains]: https://blog.ethereum.org/2015/08/07/on-public-and-private-blockchains/
[tendermint_consensus]: https://github.com/tendermint/tendermint/wiki/Byzantine-Consensus-Algorithm
