# Exonum Data Model

Here is a brief overview of how Exonum works with persistent data.

Exonum uses MerkleDB as storage framework. MerkleDB is a high-level wrapper over a key-value store, 
that provides convenient abstractions to work with blockchain-specific data(for example lists that provides cryptographic proofs for its elements).
Currently [RocksDB][rocks-db] is used for low-level key-value storage engine.
It is also possible to plug in other engines.

All data in MerkleDB are represented as objects that can be multiple types - collections, blobs, and special objects.
The framework provides basic collections such as `list` and `map` and also it's merklized versions.

Read more about MerkleDB [here][merkledb].

The system data necessary for the blockchain to work is stored in the root objects which are listed below.

## System Root Objects

The core [root objects][blockchain-schema], all of them have `core.*` prefix.

- `transactions: MapIndex`  
  Represents a map from the transaction hash into a raw transaction structure.
- `transaction_results: ProofMapIndex`  
  Keeps execution results for all accepted transactions,
  indexed by transaction hashes.
- `transactions_pool: KeySetIndex`  
  Stores the set of hashes of the known transactions that have not been
  committed yet.
- `transactions_pool_len: Entry`  
  Caches the number of entries in `transaction_pool`.
- `transactions_locations: MapIndex`  
  Keeps the block height and the tx position inside the block for every
  transaction hash.
- `blocks: MapIndex`  
  Stores the block object for every block height.
- `block_hashes_by_height: ListIndex`  
  Saves the block hash that has the requested height.
- `block_transactions: ProofListIndex`  
  Group of tables keyed by a block height. Each table keeps
  a list of transactions for the specific block.
- `precommits: ListIndex`  
  Group of tables keyed by a block hash. Each table stores a list of precommits
  of the validators for the specific block.
- `configs: ProofMapIndex`  
  Stores the configuration content in JSON format, using its hash as a key.
- `configs_actual_from: ListIndex`  
  Builds an index to quickly get a configuration that should activate at the
  specific height.
- `state_hash_aggregator: ProofMapIndex`  
  An accessory table
  used to calculate the "aggregation" of the root hashes of the individual
  service tables. In effect is sums up the state of various entities
  scattered across distinct services and their tables.


[rocks-db]: http://rocksdb.org/
[merkledb]: merkledb.md
[blockchain-schema]: https://github.com/exonum/exonum/blob/master/exonum/src/blockchain/schema.rs
