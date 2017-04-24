# DoS Protection and Consensus Algorithm

Like any other network, Exonum nodes can be susceptible to denial-of-service attacks 
(DoS). The goal of such an attack is to render an Exonum node not responsive to 
legitimate requests from other nodes and external clients. One of attack vectors 
is spam, i.e., flooding a node with a ton of meaningless requests.

*Note.* Understandably, spam protection is a high-priority feature to be implemented in 
the nearest future.

The DoS protection is two-fold:

* External: Preventing failures caused by network-level attacks and attacks 
  from external adversaries
* Internal: Preventing failures caused by consensus algorithm messages and messages 
  from Byzantine validators. This kind of protection is confined to validator nodes only.

## External Protection

The protection from external attacks is quite standard as for any service implementing 
client-server architecture and should be described in the future versions of the documentation.

## Internal Protection

The consensus algorithm provides proposals for new blocks, and one of these proposed 
blocks should be included into the blockchain after other validators approval.
Each block committed to the blockchain must be authorized by at least `+2/3` validators
(see [Consensus](../architecture/consensus.md) for more details). Internal protection
has to guarantee two properties for honest validators:

1. Bounded Message Processing Time. Each message from honest validators should be processed in a finite time
2. Bounded Consensus Message Queue. The unprocessed consensus message queue is finite.

### Bounded Message Processing Time

*Property 1* will be guaranteed in Exonum as follows. There is a unique queue for 
messages from each validator. Messages to be processed are taken from these queues 
in a circle. Thus, each time there is a finite number of messages to 
be processed before any honest validator's message. As each consensus message is 
processed in a finite time, the first property is guaranteed.

### Bounded Consensus Message Queue

The problem with message queue is that a malicious validator could spam
other validators with consensus messages such as `Propose`.
The honest validators send the only `Propose` for each
round they are leading; similarly, the number of other types of messages is also bounded
for honest validators. However, a malicious validator could send an unlimited
number of `Propose` messages in any given round in which he is a leader,
and/or different `Propose` to the different validators.
Any such message may influence an eventually committed block.

In order to satisfy *Property 2* in the future releases of Exonum,
consensus messages could be categorized in *useful* and *wasteful*.
In order to prevent the queue overflow,
the number of *useful* `Propose`, `Prevote` and `Precommit` messages could be limited
for any given round of consensus. A possible solution is to store no more than one `Propose`
per `(validator, round)` pair:

**Proposition.** For each `(peer_validator, round)` an honest validator 
stores only the `Propose` linked with the first `Propose`, `Prevote`, `Precommit`, or `Commit` message
from `peer_validator` at this `round`.

As the number of `Propose` messages is limited by the product of round number and the validators number
and all other consensus messages are linked with `Propose`,
the number of useful consensus messages would be bounded.
