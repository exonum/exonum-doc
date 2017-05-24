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

### Non-Strawman Version

**Note.** In the following description, +2/3 means more than two thirds of the validators,
and -1/3 means less than one third.

The algorithm above is overly simplified:

- A validator may receive messages in any order because of network delays.
  For example, a validator may receive a prevote or precommit for a block proposal
  that the validator doesn’t know
- There can be validators acting not according to the consensus algorithm.
  Validators may be offline, or they can be corrupted by an adversary. To formalize
  this assumption, it’s assumed that -1/3 validators at any moment of time may be
  acting arbitrarily. Such validators are called *Byzantine* in computer science;
  all other validators are *honest*

The 3-phase consensus (proposals, prevotes and precommits) described above
is there to make the consensus algorithm operational under these conditions.
More precisely, the algorithm is required to maintain *safety* and *liveness*:

- Safety means that once a single honest validator has committed a block, no
  other honest validator will ever commit any other block at the same height
- Liveness means that honest validators keep committing blocks from time to time

#### Locks

Byzantine validators may send different messages to different validators.
To maintain safety under these conditions, the Exonum consensus algorithm uses
the concept of *locks*.

A validator that has collected a +2/3 prevotes for some block proposal locks on
that proposal. A locked validator does not vote for any other proposal except
for the proposal on which it is locked. When a new round starts,
a locked validator immediately sends a prevote indicating
the it’s locked on a certain proposal. Other validators may request prevotes
that led to the lock from a locked validator, if they do not have them locally
(these proposals are known as *proof of lock*).

**Example.** Validator A gets prevotes from validators B and C,
and they do not get prevotes from each other because of the connection problems.
Then validators B and C can request each other’s prevotes from validator A.

Since there are -1/3 Byzantine validators, at least +1/3 prevotes from the
+2/3 prevotes collected for the lock were sent by honest validators.
There are -2/3 remaining nodes, so an honest validator cannot lock on another proposal.
Thus, once a single honest validator is locked on a proposal, no other proposal
can be accepted.

### Requests

As consensus messages may be lost or come out of order, the Exonum consensus
uses the *requests* mechanism to obtain unknown information from the other validators.
A request is sent by a validator to its peer
if the peer has information of interest, which is unknown to the validator,
and which has been discovered during the previous communication with the peer.

**Example.** A request is sent if the node receives a consensus message from
a height greater than the local height. The peer is supposed to respond with
a message that contains transactions in an accepted block, together with a proof
that the block is indeed accepted (i.e., precommits of +2/3 validators corresponding
to the block).

There are requests for all consensus messages: proposals, prevotes, and precommits.
As consensus messages are authenticated with digital signatures, they can be sent
directly in response to requests.

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

There are request messages for transactions, `Propose` and `Prevote` messages, and
blocks. The rules of generation and processing for these messages are fairly obvious.

**Example.** A `RequestPropose` message is generated if a validator receives a consensus
message (`Prevote` or `Precommit`) that refers to the `Propose` message, which
is unknown to the validator. A receiver of a `RequestPropose` message sends a requested
`Propose` in response.

## Distinguishing Features

In comparison with other BFT algorithms, the consensus algorithm in Exonum has
the following distinctive features.

### Unbounded Rounds

Rounds have a fixed start time but they do not have a definite end
time (a round ends only when the next block is received).

Partial synchrony of the network means that any message will be delivered within
some finite (but beforehand unknown) time.

Let the time of the round is fixed, the state of the network has deteriorated at
the moment, and the network did not manage to accept the proposal until the end
of the round. Then in the next round, the entire process of nominating a
proposal and voting for it must begin again. In this case, the timeout of the
next round should be increased so that the block could be accepted during new
round timeout under the poor connection. The need to repeat anew the work that
has already been done and the increase in the timeout leads to additional time
consuming to accept the proposal.

In contrast to the case discussed in the previous paragraph, the absence of a
fixed round end time allows to accept the proposal within the minimum necessary
time.

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

If the Byzantine node sends out proposals with different transaction order to
different nodes, the nodes do not spend time checking the order and applying
transactions in the prevote stage. A different transaction order will be
detected when comparing block_hash received in the prevote messages from other
nodes and block_hash received in the proposal message.

So, this split of work helps reduce the negative impact of byzantine nodes on the
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
