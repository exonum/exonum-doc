# DoS Protection and Consensus Algorithm

The current version of the product is not protected from Denial-of-Service (DoS) attacks.
But such a feature is going to be implemented in future releases. 

The DoS protection is two-fold:

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

1. Bounded Message Processing Time. Each message from honest validators should be processed in a finite time
2. Bounded Consensus Message Queue. The unprocessed consensus message queue is finite.
