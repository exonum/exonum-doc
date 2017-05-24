# Transactions

A transaction in a blockchain
([as in usual databases](https://en.wikipedia.org/wiki/Database_transaction))
is a group of sequential operations with the database and is a logical unit of
work with data. So any business logic of the project with Exomum should be
formulated using different types of transactions. A transaction can be either
executed either entirely and successfully, respecting the integrity of the
data, or a transaction can be not performed at all, and then it should not have
any effect. A transaction could be created by the allowed entities (for
example, a private key owner could initialize his coins transfer for
[cryptocurrency](https://github.com/exonum/cryptocurrency)) and sent for the
distributed system of validators for the consideration. If the transaction is
correct, it would be included in a block of the blockchain through the
validators voting process via the
[consensus algorithm](./advanced/consensus/consensus.md) work. All transactions
are executed one by one in the order in which they are placed into the
blockchain.

A transaction consists of

1. `service_id`: sets the [service](services.md) to make a deal with (for
  example, configuration or *cryptocurrency*). Such information is redundant
  but helpful to find methods to process transaction (such as `verify` and
  `execute`). All the transactions are stored in the blockchain sequentially.
  But such a manner is not useful for queries. So any fat client also
  duplicates information from the blockchain in the special tables of the
  blockchain-level key-value storage (implemented with
  [LevelDB](http://leveldb.org/) those support queries and also provides proofs
  of consistency with the blockchain (see
  [Merkle index](../advanced/merkle-index.md) and
  [Merkle Patricia index](../advanced/merkle-patricia-index.md) for more
  details).
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
  with the same previous three fields. The message body is serialized according
  to the binary serialization specification from its type specification in the
  service
4. `signature`: the cryptographic signature for the message with a transaction.
  Any author of the transaction (as any other message) should have the private
  and public keys which allow him to generate a correct transaction. He
  shouldn't provide any other person his private key but should use it to sign
  messages. The signature of a particular person could be verified by anyone
  using the public key and `Exonum.verifySignature` function. See
  [Exonum client](https://github.com/exonum/exonum-client) for details.

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

Purity means that the transaction could be serialized (i.e. at least all
methods `verify`, `execute` and `info` could be applied) no matter the
blockchain state (but the result of such methods application could depend on
blockchain state).

### Sequential consistency

[Sequential consistency](https://en.wikipedia.org/wiki/Sequential_consistency)
essentially means that the blockchain looks like a centralized system for an
external observer (e.g., a thin client). All transactions in the blockchain
affect the blockchain state as if they were executed one by one in the order
specified by their ordering in blocks. Such a property is guaranteed by the
[consensus algorithm](../advanced/consensus/consensus.md).

### Non-replayability

Non-replayability means that an attacker cannot take an old legitimate
transaction from the blockchain and apply it to the blockchain state again.
Assume Alice pays Bob 10 coins using the Exonum
[cryptocurrency service](https://github.com/exonum/cryptocurrency).
Non-replayability prevents Bob from taking the Alice's transaction and
submitting it to the network again to get extra coins. Naturally,
non-replayability is also a measure against DoS attacks; it prevents an
attacker from spamming the network with his own or others' transactions.
The `seed` field inside the transaction and ignoring the transactions, already
included into the blockchain, for the new blocks guarantees this property.
