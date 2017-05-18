# Consensus in Exonum

Generally, a [consensus algorithm][wiki:consensus] is a process of
obtaining an agreed result by a group of participants. In Exonum the
consensus algorithm is used in order to agree on the list of transactions
in blocks added to the blockchain. The other goal of the algorithm is to ensure
that the results of the transaction execution are interpreted in the same way
by all nodes in the blockchain network.

The consensus algorithm in Exonum is based on the [algorithm proposed in
Tendermint][tendermint_consensus].

## Assumptions

Not all the nodes in the blockchain network may be actively involved in
the consensus algorithm. Rather, there is a special role for active consensus
participants – *validators*.
For example, in a [consortium blockchain][public_and_private_blockchains]
validators could be controlled by companies participating in the consortium.

The consensus algorithm must operate in the presence of faults, i.e., when
participants in the network may behave abnormally. The Exonum consensus algorithm
assumes the worst; it operates under the assumption that any individual node
or even a group of nodes in the blockchain network can crash or can be compromised
by a resourceful adversary (say, a hacker or a corrupt administator). This
threat model is known in CS as [Byzantine faults][wiki:bft]; correspondingly,
the Exonum consensus algorithm is Byzantine fault tolerant (BFT).

From the computer science perspective, the Exonum consensus algorithm takes
usual assumptions:

- Validator nodes are assumed to be [partially synchronous][partial_synchrony],
  i.e., their computation performances do not differ much
- The network is partially synchronous, too. That is, all messages are delivered
  in the finite time which, however, is unknown in advance
- Each validator has an access to a local **stopwatch** to determine time intervals.
  On the other hand, there is no global synchronized time in the system
- Validators can be identified with the public-key cryptography; correspondingly,
  the communication among validators is authenticated

The same assumptions are used in [PBFT][pbft] (the most well-known BFT consensus)
and its successors.

Other assumptions:

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
number may change due to a change in the list of validators.

- Nodes receive and exchange among themselves transactions that need to be added
to the blockchain. Each node has a set of transactions that have not yet been
added to the blockchain. This set will be called **pool of unconfirmed
transactions** . In general, the pools of unconfirmed transactions are different
for different nodes. If necessary, the nodes can request unknown transactions
from other nodes. We will also refer to the transaction added to the blockchain
in one of the previous blocks as **committed**.

## Algorithm overview

The process of reaching consensus on the next block (at the blockchain height `H`)
consists of several **rounds**, numbered from 1\. The first round starts once the
validator commits the block at height `H - 1`. The onsets of rounds are determined
by a fixed timetable: rounds start after regular intervals. As there is no global time,
rounds may start at a different time for different validators.

When the round number `R` comes, the previous rounds are not completed.
That is, round `R` means that the validator can process messages
related to a round with a number no greater than `R`.
The current state of a validator can be described as a tuple `(H, R)`.
The `R` part may differ among validators, but the height `H` is generally the same.

To put it *very* simply, rounds proceed as follows:

1. Each round has a *leader node*. The round leader offers a *proposal* for the next block
   and broadcasts it accross the network. The logic of selecting the leader node
   is described in the separate algorithm
2. Validators may vote for the proposal by broadcasting a *prevote* message. A prevote means that
   that the validator has been able to parse the proposal and has all transactions specified
   in it
3. After a validator has collected enough prevotes from a supermajority of other validators,
   it applies transactions specified in the prevoted proposal, and broadcasts a *precommit* message.
   This message contains the result of the proposal execution in the form
   of a new state hash (**TODO:** link to state hash/data model).
   The precommit expresses that the sender is ready to commit the corresponding
   proposed block to the blockchain, but needs to see what the other validators have to say
   on the matter just to be sure
4. Finally, if a validator has collected a supermajority of precommits with the same state hash
   for the same proposal, the proposed block is committed to the blockchain.

In reality, the algorithm is more complex. It uses *requests* to obtain unknown
information from the other nodes. Such requests are sent to nodes that signal
presence of unknown information (for example, messages are sent from heights
greater than the current node height in the case of a lagging node). Sending and
processing of such messages is algorithmized (**TODO:** insert link to request
algorithm). The algorithm for sending requests is an integral part of the
consensus algorithm.

Also, consensus algorithm can process any type of message (message types are
listed below) at any time.

Validators exchange messages. The consensus algorithm uses several types
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
  6. _Request_ - request message for receiving certain information using
  *requests algorithm*.

In comparison with other *PBFT* algorithms, consensus algorithm in Exonum has
such distinctive features:

- Rounds have a fixed start time but they do not have a definite end
time (round ends when the next block is received). This reduces the effect of
network delays.

- _Propose_ message includes only transaction hashes. Transactions are included
into _Block_ message and executed only at the **_LOCK_** stage. This ensures
system asynchrony.

- *Requests algorithm* allows node to restore any consensus info from the other
nodes.

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

## Algorithm specification

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

## Proof of algorithm correctness

In this version, we assume that messages are processed instantly. To get rid of
this assumption, it is enough to guarantee the finality of the processed
messages pertaining to each round, and the correct organization of the queue for
messages from different rounds.

**Proposition 1\. (Round beginning).** _All non-Byzantine nodes being at a
height of not less than `H`, will be in the state `(H, R)`or higher (either
bigger round or bigger height), where `R` is an arbitrary fixed constant._

**Proof**

We will prove the statement above for every single non-Byzantine node. That node
shall move to a new height in a finite time (and in this case the condition will
be satisfied) or remain at the height `H`. In the second case, the node
increments the round counter at fixed intervals (by stopwatch). From the fact
that the transition to a new round is carried out for a limited time `T` it
follows that the round counter of any non-Byzantine validator will be increased
to the value `R` no more than in finite time `F T`.

Thus, all non-Byzantine validators will move to the state `(H, R)` or higher.

**End of proof**

**Proposition 2\. (Non-Byzantine leader).** _For each height `H` there exists a
round in which the non-Byzantine node will become the leader._

**Proof**

**TODO:** Property of round robin.

**End of proof**

**Proposition 3\. (Deadlock absence)** _A certain non-Byzantine node will sooner
or later send some message relating to the consensus algorithm (propose,
prevote, precommit, commit)._

**Proof**

Let us prove it by contradiction. Assume that each non-Byzantine node send no
messages for an arbitrarily long period of time; then that node updates neither
the current height (otherwise it would send a message to _commit_) nor the PoL
state (_prevote_ message would be sent for the new PoL upon the coming of a new
round in the case of a PoL update, if no other message had been sent before this
time). Consider the cases of PoL status:

1. **Some non-Byzantine node has a saved PoL**. Then this node will send a
_prevote_ message for the proposal saved in the PoL when the next round timeout
occurs (unless it sends any other message earlier).
2. **No one non-Byzantine node has a saved PoL**. Then there will always come
another round in which some non-Byzantine node will be the leader (see the
previous statement). In this case, the node will form a new proposal and send
_propose_ and _prevote_ messages.

**End of proof**

**Consequence.** _If there exists an unlimited number of heights on which the
validator can become a leader (property of round robin), then any non-Byzantine
node will send an arbitrarily large number of messages related to the consensus
algorithm (propose, prevote, precommit, commit)._

--------------------------------------------------------------------------------

**Proposition 4\. (Obligatory block acceptance, liveness)** _There necessarily
will come a point in the system when the node adds the block to the blockchain._

**Proof**

Suppose the network be at a certain height `H`; then the maximum height of a
non-Byzantine nodes' blockchain is equal to `H`. In accordance with the
proposition 3, all non-Byzantine nodes will be able to move up to the height
`H`. Next, the state is considered when all the non-Byzantine nodes are at the
height `H`.

Let `R(T)` denote the round following the maximum round with non-Byzantine
validators, at the moment `T` by the clock of an outside observer.

Similarly, `T(R)` is the time of coming of the `R` round by the clock of an
outside observer for all non-Byzantine validators.

Let the non-Byzantine node be the leader for the first time in the round with
the number `R<R*` (where `R *` denote a uniform estimate of `R`). Then the
coming time of the round `R*` for all non-Byzantine nodes on the outside
observer's watch is `T(R*)`.

Not later than at the moment `T(R*) + ?T + propose_timeout` each non-Byzantine
node will receive a correct proposal from the` R` round. Further, not later than
through `2 ?T`, that node will know all the transactions from this proposal
(request mechanism). Denote this time `T* = T(R*) + propose_timeout + 3 ?t`.

If no non-Byzantine node has PoL to the `R(T*)` round, then in this round the
node  will receive PoL (for the proposal from the `R` round). Indeed, if no one
has PoL, then the nodes could not send the _prevote_ message in the `R(T*)`
round. In accordance with the algorithm for processing complete proposals, the
confirming _prevote_ message will be sent.

Thus, **by the time `T'= T(R(T*)) + ?T` at least one non-Byzantine node will
have PoL**.

**Not later than `T'' = T(R(T')) + 2 ?T` each non-Byzantine node will have some
PoL**. Indeed, starting with the `R(T')` round, the non-Byzantine node will send
_prevote_ messages for the proposal from its PoL. Non-Byzantine nodes that do
not have PoL will be able to get this PoL through the request mechanism by the
time `T''`.

None of the non-Byzantine nodes will send _prevote_ for new proposals since the
moment `T''`. Hence, new PoL will not appear in the network.

During one iteration `T(R(...)) + 2 ?T` at least one non-Byzantine validator
will increase its PoL. Indeed, all the non-Byzantine nodes already have some
PoLs. In this case, they will always send _prevote_ messages for the
corresponding proposals. And according to the logic of their processing, if the
non-Byzantine node receives _prevote_ pointing to a larger PoL, a request for
missing _prevote_ for this (bigger) PoL occurs.

Since there exists finite number of the validators and possible proposals, it
follows that in some finite time `T '''` + 2/3 of the non-Byzantine validators
will receive PoL for the same proposal. After that they will be able to send
_precommit_ messages.

Not later than time `T(R(T''')) + ?T` at least one non-Byzantine validator will
accept the new block and hence some node will correctly add the block to the
blockchain.

**End of proof**

--------------------------------------------------------------------------------

**Proposition 5\. (Absence of forks)** _If some non-Byzantine node adds a block
to the blockchain, then no other node can add another block, confirmed with +2/3
precommit messages, to the blockchain at the same height._

**Proof**

Let some node added the `B` block to the blockchain. This could only happen if
that node went into the **COMMIT** state. There exist three possibilities of the
transition to the **COMMIT** state: from **LOCK**, **_Prevote _**
**processing**, and **Availability of the full proposal**. In all these cases,
the condition of the transition is the presence of +2/3 _precommit_ messages for
some proposal `P` from the `R` round and the result of applying the
corresponding block leads to the same `state_hash`. Since the number of
Byzantine nodes is -1/3, +1/3 of the Neo-Byzantine nodes sent _precomit_
messages in the corresponding round. Such a message could only be sent within
the **LOCK** state in which the PoL was stored for the `P` proposal in the `R`
round. This could happen only if these nodes did not send _prevote_ messages in
rounds `R '> R` for `P'! = P` (special condition for sending the _precommit_
message). Also, these nodes sent _prevote_ messages in all rounds after `R`
until their current rounds. Thus, since the remaining nodes are -2/3, we have
two consequences.

1. In no rounds after `R` we can get PoL (in other words go to the ** LOCK **
state) for the `P '! = P` proposal, because this requires +2/3 _prevote_
messages.

2. In all rounds of `R '> R`, new PoLs cannot emerge in the network, except for
PoLs related to the `P` proposal (and, accordingly, to the `B` block). Indeed,
at the beginning of the round following the current round, the specified +1/3 of
the non-Byzantine nodes will be in the state with the saved PoL corresponding to
the `P` proposal. And consequently they will send _prevote_ messages only for
the saved `P` proposal according to the **Processing of the timeout of the
round** state.

Thus, messages of _precommit_ type can not be sent for any other block. This
means that none of the non-Byzantine node can add another block to the
blockchain.

**End of proof**

**Corollary.** _The property of fork absence will be preserved also in the
case of an asynchronous network ._

**Proof**

The proof of _Proposition 5_ did not in any way use the assumption of partial
synchronism. Therefore, it is also true in an asynchronous network.

**End of proof**

--------------------------------------------------------------------------------

**Proposition 6\. (Moving nodes up)** _Any non-Byzantine node can get all the
blocks included in the blockchain by any other non-Byzantine node._

**Proof**

Let the `A` node fall behind for some reason from the` B` node. And the `A` node
is at the height `H`, while the `B` node is at the height `H + h`. We will show
that in a finite time the `A` node can be pulled to the height `H + 1`.

All messages described in the algorithm and related to the consensus algorithm
(_propose_, _prevote_, _precommit_, _status_) contain the current height. Thus,
as soon as the `B` node sends any of these messages and the message is delivered
to `A`, the `A` node will understand that it is behind and will request the next
block (it can do this not at the `B` node, but at any other node; if the block
is added, then the block will be correct due to absence of forks
(proposition 5)). In accordance with the corollary from proposition 3 (deadlock
absence), the `B` node always sends some message of consensus algorithm .

**End of proof**
--------------------------------------------------------------------------------

**Proposition 7\. (Censorship resistance)** _Not less than once in `1/3` blocks
the non-Byzantine node will be the leader of the accepted block._

**Proof**

**TODO:** Property of a new algorithm for choosing a leader.

**End of proof**

[partial_ordering]: https://en.wikipedia.org/wiki/Partially_ordered_set#Formal_definition
[partial_synchrony]: http://groups.csail.mit.edu/tds/papers/Lynch/podc84-DLS.pdf
[public_and_private_blockchains]: https://blog.ethereum.org/2015/08/07/on-public-and-private-blockchains/
[tendermint_consensus]: https://github.com/tendermint/tendermint/wiki/Byzantine-Consensus-Algorithm
[wiki:consensus]: https://en.wikipedia.org/wiki/Consensus_(computer_science)
[wiki:bft]: https://en.wikipedia.org/wiki/Byzantine_fault_tolerance
[pbft]: http://pmg.csail.mit.edu/papers/osdi99.pdf
