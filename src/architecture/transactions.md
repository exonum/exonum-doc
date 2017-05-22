# Transactions

A transaction in a blockchain
([as in usual databases](https://en.wikipedia.org/wiki/Database_transaction))
is a group of sequential operations with the database and is a logical unit of
work with data. So any business logic of the project with Exomum should be
formulated using different types of transactions. A transaction can be either
executed either entirely and successfully, respecting the integrity of the data
and regardless of the other transactions going in parallel, or a transaction
can be not performed at all, and then it should not have any effect. A
transaction could be created by the allowed entities (for example, a private
key owner could initialize its coins transfer for cryptocurrency) and sent for
the distributed system of validators for the consideration. If the transaction
is correct, it would be included in a block of the blockchain through the
validators voting process via the Consensus algorithm work.

A transaction consists of

1. `service_id`: sets the **TODO** ref service to make a deal with (for
  example, configuration or cryptocurrency). All the transactions are stored in
  the blockchain sequentially. But such a manner is not useful for queries. So
  any fat client also duplicates information from the blockchain in the special
  databases (one per service) those support queries and also provides proofs of
  consistency with the blockchain (see **TODO** ref Merkle index and ref Merkle
  Patricia index.
2. `message_id`: the nodes of the blockchain network sends and receives messages
  to communicate. The `message_id` defines the message type. For the transaction,
  it means the type of transaction in the service. For example, service
  *cryptocurrency* could include different types of transactions:
  `AddFundsTransaction` for coins emission and `TransferTransaction` for money
  transfer et. al.
3. `body`: the body of the transaction, which includes specific for a given
  transaction type (`message_id`) data and a format of which is specified by
  service with `service_id`. For example, the body of `TransferTransaction`
  should include field `from` for coins sender, `to` for coins recipient,
  `amount` for the sending amount and `seed` to distinct different transactions
  with the same previous three fields
4. `signature`: the cryptographic signature for the message with a transaction.
  Any author of the transaction (as any other message) should have the private
  and public keys which allow him to generate a correct transaction. He
  shouldn't provide any other person his private key but should use it to sign
  messages. The signature of a particular person could be verified using by
  anyone using the public key.

## Transaction lifecycle

1. A transaction is created by an external entity (e.g., a
  [thin client](clients.md)) and is signed with a private key
2. The transaction is broadcast to the network
3. The transaction is verified on each full node including validator nodes
  which it reaches (by transaction's method `verify` which includes at least
  signature verification) and is added to the pool of unconfirmed transactions
4. The transaction is included into a block proposal (or multiple proposals)
5. The transaction is executed (by transaction's method `execute` which
  includes necessary changes of the corresponding service database) during the
  lock step of the consensus algorithm, when a validator node has collected all
  transactions for a block proposal and under certain conditions which imply
  that the considered proposal is going to be accepted in nearly future
6. Finally, when a certain *precommit* gathers necessary approval among
  validators, the block is committed to the blockchain. This means that
  transactions from the committed block change the blockchain state, are
  executed sequentially and in the same exact order on every node

## Blockchain transaction properties

### Purity

The right to send transaction could be checked using cryptography no matter the
transaction source.

### Sequential consistency

Any valid copy of the blockchain has the same order of blocks and transactions
in it. Such a property is guaranteed by the **TODO** ref Consensus algorithm.

### Non-replayability

Any transaction could be included into the blockchain only once. The `seed`
field inside the transaction and ignoring the transactions, already included
into the blockchain, for the new blocks guarantees this property.
