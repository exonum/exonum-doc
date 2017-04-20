# DDoS Protection and Consensus Algorithm

The DDoS protection is two-fold

* external. To prevent fails cased by net attacks and attacks from users
* internal. To prevent fails cased by consensus algorithm messages and messages 
from Byzantine validators.

## External Protection

The protection from external attacks is quite standard as for any other client-server
service and should be commented in the future versions of the documentation.

## Internal Protection

The consensus algorithm provides new blocks for Blockchain via validators voting.
Each committed to the Blockchain block must be signed by at least `+2/3` validators
(see [Consensus](../architecture/consensus.md) for more details). And internal protection
have to guarantee two property for each regular (not Byzantine validator)

1. each message from regular validators would be processed in a finite time
2. the unprocessed consensus messages queue is finite.

### Make finite message process time

*Problem 1* admits simple solution: there is a unique queue for messages from each
validator. And the message to process is taken from such queues in a circle. So
each time there is an only finite number of messages to be processed before each
regular validators message. As each consensus message is processed in a finite time,
the first property is guaranteed.

### Make finite message process time

A Byzantine validator could spam others with consensus messages such as propose.
Any such a message may influence to the block commit. To prevent the queue overload
the number of useful propose/prevote/precommit messages should be limited at least
for each round of voting. The regular validators send the only propose for each
round they are leading. But the problem is that Byzantine ones could send an unlimited
number of proposes and different proposes to the various validators. The possible
solution is to store not more than one propose per pair (validator, round). And
for each pair (validator, round) one stores only the propose linked with the first
propose/prevote/precommit/commit message from this validator at this round about
this round proposes. As the number of proposes would be limited by the product of
round number and the validators number and each correct prevote/precommit/commit
is linked with propose, the number of useful consensus messages would be bounded.
