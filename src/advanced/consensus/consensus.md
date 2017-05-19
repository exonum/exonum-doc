# Consensus in Exonum

Generally, a [consensus algorithm][wiki:consensus] is a process of
obtaining an agreed result by a group of participants. In Exonum the
consensus algorithm is used to agree on the list of transactions
in blocks added to the blockchain. The other goal of the algorithm is to ensure
that the results of the transaction execution are interpreted in the same way
by all nodes in the blockchain network.

The consensus algorithm in Exonum uses some ideas from
the [algorithm proposed in Tendermint][tendermint_consensus], but has
[several distinguishing characteristics](#distinguishing-features) compared to it
and other consensus algorithms for blockchains.

## Assumptions

The Exonum consensus algorithm assumes that the consensus participants
can be identified. Thus, the algorithm fits for permissioned blockchains,
which Exonum is oriented towards, rather than permissionless ones.

Not all the nodes in the blockchain network may be actively involved in
the consensus algorithm. Rather, there is a special role for active consensus
participants – *validators* or *validator nodes*.
For example, in a [consortium blockchain][public_and_private_blockchains]
validators could be controlled by the companies participating in the consortium.

The consensus algorithm must operate in the presence of faults, i.e., when
participants in the network may behave abnormally. The Exonum consensus algorithm
assumes the worst; it operates under the assumption that any individual node
or even a group of nodes in the blockchain network can crash or can be compromised
by a resourceful adversary (say, a hacker or a corrupt administator). This
threat model is known in computer science as [Byzantine faults][wiki:bft];
correspondingly, the Exonum consensus algorithm is Byzantine fault tolerant (BFT).

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

## Algorithm Overview

The process of reaching consensus on the next block (at the blockchain height `H`)
consists of several **rounds**, numbered from 1\. The first round starts once the
validator commits the block at height `H - 1`. The onsets of rounds are determined
by a fixed timetable: rounds start after regular intervals. As there is no
global time, rounds may start at a different time for different validators.

When the round number `R` comes, the previous rounds are not completed.
That is, round `R` means that the validator can process messages
related to a round with a number no greater than `R`.
The current state of a validator can be described as a tuple `(H, R)`.
The `R` part may differ among validators, but the height `H` is usually the same.
If a specific validator is lagging (e.g., during its initial synchronization,
or if it was switched off for some time), its height may be lower.
In this case, the validator can request missing blocks from
other validators and full nodes in order to quickly synchronize with the rest
of the network.

### Strawman Version

To put it *very* simply, rounds proceed as follows:

1. Each round has a *leader node*. The round leader offers a *proposal*
  for the next block and broadcasts it accross the network. The logic of selecting
  the leader node is described [in a separate algorithm](leader-election.md)
2. Validators may vote for the proposal by broadcasting a *prevote* message.
  A prevote means that the validator has been able to parse the proposal
  and has all transactions specified in it
3. After a validator has collected enough prevotes from a supermajority
  of other validators, it applies transactions specified in the prevoted proposal,
  and broadcasts a *precommit* message. This message contains the result of
  the proposal execution in the form of [a new state hash](../../architecture/storage.md).
  The precommit expresses that the sender is ready to commit the corresponding
  proposed block to the blockchain, but needs to see what the other validators
  have to say on the matter just to be sure
4. Finally, if a validator has collected a supermajority of precommits with
  the same state hash for the same proposal, the proposed block is committed
  to the blockchain.

### Back to Reality

- +2/3 means "more than 2/3", and -1/3 means less than one third.

- A set of +2/3 votes from _prevote_ state `(H, R)` will be called
  _Proof-of-Lock_ (_PoL_). Nodes should store PoL. The node can have no more than
  one stored PoL.

- We will say that *PoL is greater than recorded one* (has a higher priority), in
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

### Node States Overview

The order of states in the proposed algorithm is as follows:

```none
Commit -> (Round)+ -> Commit -> ...
```

On the timeline, these states look like this (for one of the
validator nodes):

```none
Commit: |  H  |                       | H+1 |                        ...
Round1: |     | R1                    |     | R1                     ...
Round2: |          | R2               |          | R2                ...
Round3: |               | R3          |               | R3           ...
Round4: |                    | R4     |                    | R4      ...
...
------------------------------------------------------------------>  Time
```

Note that rounds have a fixed start time but they do not have a definite end
time (they end when the next block is received). This differs from common
behavior of partially synchoronous consensus algorithms, in which rounds have
a definite conclusion (i.e., messages generated during the round `R`
must be processed only during the round `R`).

## Network Communication

### Messages

The consensus algorithm makes use several types of messages. All messages
are authenticated with the help of public-key digital signatures, so that
the sender of the message is unambiguously known and cannot be forged.
Furthermore, the use of digital signatures (instead of, say, [HMACs][wiki:hmac])
ensures that messages can be freely retransmitted across the network.
Moreover, this can be done by load balancers that have no idea whatsoever
as to the content of messages.

#### Propose

`Propose` message is a set of transactions proposed by the round leader
for inclusion into the next block.
Instead of whole transactions, `Propose` messages include only transaction hashes.
A validator that received a `Propose` message can request missing transactions
from its peers.

If the behavior is correct, `Propose` is sent only by the leader node of the round.

#### Prevote

`Prevote` is a vote for a `Propose` message. `Prevote` indicates that the node
has a correctly formed `Propose` and all the transactions specified in it.
`Prevote` is broadcast to all validators.

#### Precommit

`Precommit` is a message expressing readiness to include the next block into
blockchain. To be distributed by all nodes.

#### Status

`Status` is an information message about the current height. It is sent with a
periodicity written in the `status_timeout` variable (consensus parameter).

#### Block

A `Block` message contains a block (in the meaning of blockchain) and a
set of `Precommit` messages that allowed that block to be accepted.
To be sent on request.

### Requests

The Exonum consensus uses the *requests* mechanism to obtain unknown
information from the other nodes. A request is sent by the node to its peer
if the peer has information of interest, which is unknown to the node,
and which has been discovered during the previous communcation with the peer.
For example, a request is sent if the node receives
a consensus message from a height greater than the local height.

Sending and processing of such messages is algorithmized.

## Distinguishing Features

In comparison with other BFT algorithms, the consensus algorithm in Exonum has
the following distinctive features.

### Unbounded Rounds

Rounds have a fixed start time but they do not have a definite end
time (a round ends only when the next block is received). This reduces
the effect of network delays.

### Compact Proposals

`Propose` messages include only transaction hashes. (Transactions are included
directly into `Block` messages.) Furthermore, transaction execution is delayed;
transactions are applied only at the when a node locks on a `Propose`.

Delayed transaction processing reduces nagtive impact of malicious nodes on
the system througput and latency. Indeed, it splits transaction processing among
the stages of the algorithm:

- On the prevote stage validators only ensure that a list of transactions
  included in a proposal is correct (i.e., all transactions in the `Propose` exist
  and are internally correct)
- On the precommit stage validators apply transactions to the current
  blockchain state
- On the commit stage validators ensure that they achieved the same state
  after addition of new transactions

This split of work helps reduce the negative impact of byzantine nodes on the
overall system performance.

### Requests Algorithm

Requests algorithm allows node to restore any consensus info from the other
nodes.

[partial_ordering]: https://en.wikipedia.org/wiki/Partially_ordered_set#Formal_definition
[partial_synchrony]: http://groups.csail.mit.edu/tds/papers/Lynch/podc84-DLS.pdf
[public_and_private_blockchains]: https://blog.ethereum.org/2015/08/07/on-public-and-private-blockchains/
[tendermint_consensus]: https://github.com/tendermint/tendermint/wiki/Byzantine-Consensus-Algorithm
[wiki:consensus]: https://en.wikipedia.org/wiki/Consensus_(computer_science)
[wiki:bft]: https://en.wikipedia.org/wiki/Byzantine_fault_tolerance
[pbft]: http://pmg.csail.mit.edu/papers/osdi99.pdf
[wiki:hmac]: https://en.wikipedia.org/wiki/Hash-based_message_authentication_code
