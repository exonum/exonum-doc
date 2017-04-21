# DDoS Protection and Consensus Algorithm

The DDoS protection is two-fold:

* External: Preventing failures caused by network-level attacks and attacks 
  from external adversaries
* Internal: Preventing failures caused by consensus algorithm messages and messages 
  from Byzantine validators. This kind of protection is confined to validator nodes only.

## External Protection

The protection from external attacks is quite standard as for any service implementing 
client-server architecture and should be commented in the future versions of the documentation.

## Internal Protection

The consensus algorithm provides proposals for new blocks to be included into the blockchain, 
which are then need to be approved by validators.
Each block committed to the blockchain must be authorized by at least `+2/3` validators
(see [Consensus](../architecture/consensus.md) for more details). Internal protection
has to guarantee two properties for honest validators:

1. Each message from honest validators should be processed in a finite time
2. The unprocessed consensus message queue is finite

### Bounded Message Processing Time

*Property 1* is guaranteed in Exonum as follows. There is a unique queue for messages from each
validator. Messages to be processed are taken from these queues in a round robin fashion. Thus,
each time there is a finite number of messages to be processed before any
honest validator’s message. As each consensus message is processed in a finite time,
the first property is guaranteed.

### Bounded Consensus Message Queue

A Byzantine validator could spam other validators with consensus messages such as `Propose`.
Any such a message may influence a committed block. In order to prevent the queue overload,
the number of useful propose/prevote/precommit messages should be limited at least
for each round of voting. The honest validators send the only propose for each
round they are leading. But the problem is that Byzantine ones could send an unlimited
number of proposes and different proposes to the various validators. The possible
solution is to store not more than one propose per pair `(validator, round)`. And
for each pair `(validator, round)` one stores only the propose linked with the first
propose/prevote/precommit/commit message from this validator at this round about
this round proposes. As the number of proposes would be limited by the product of
round number and the validators number and each correct prevote/precommit/commit
is linked with propose, the number of useful consensus messages would be bounded.
