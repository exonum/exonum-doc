# Transactions

A transaction in a Blockchain (as in usual databases) is a group of sequential operations with the database, which is a logical unit of work with data. So any business logic of the project with Exomum should be formulated using different types of transactions. A transaction can be executed either entirely and successfully, respecting the integrity of the data and regardless of the other transactions going in parallel, or not performed at all, and then it should not have any effect. A transaction could be created by the allowed entities (for example, a private key owner could initialize its coins transfer for cryptocurrency) and send for the distributed system of validators for the consideration. If the transaction is correct, it would be included in a block of the Blockchain throw the validators voting process via the Consensus algorithm work.

A transaction consists of

1. `service_id`: sets the [service](services.md) to make a deal with (for example, configuration or cryptocurrency). All the transactions are stored in the Blockchain sequentially. But such a manner is not useful for queries. So any fat client also duplicates information from the Blockchain in the special databases (one per service) those support queries and also provides proofs of consistency with the Blockchain (see [Merkle index](advanced/merkle-index.md) and [Merkle Patricia index](advanced/merkle-patricia-index.md) sections)
2. `message_id`: the nodes of the Blockchain network sends and receives messages to communicate. The message id defines the message type. For the transaction, it means the type of transaction in the service. For example, service _cryptocurrency_ could include different types of transactions: `AddFundsTransaction` for coins emission and `TransferTransaction` for money transfer et. al.
3. `body`: the body of the transaction, which includes specific for the given transaction type (`message_id`) data. For example, the body of `TransferTransaction` should include field `from` for coins sender, `to` for coins recipient, `amount` for the sending amount and `seed` to distinct different transactions with the same previous three fields
4. `signature`: the cryptographic signature for the message with a transaction. Any author of the transaction (as any other message) should have the private and public keys which allow him to generate a correct transaction. He shouldn't provide any other person his private key but should use it to sign messages. And any other could check if the author signed the message using public key and signature.

The main properties of Blockchain transactions are

1. _purity_: the right to send transaction could be checked no matter the transaction source using cryptography
2. _sequential consistency_: any valid copy of the Blockchain has the same order of blocks and transactions in it. Such a property is guaranteed by the [Consensus algorithm](advanced/consensus/consensus.md)
3. _non-replayability_: any transaction could be included into the Blockchain only once. The `seed` field inside the transaction and ignoring the already included into the Blockchain transactions for the new blocks guarantees it.
