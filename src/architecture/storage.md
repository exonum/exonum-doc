# Exonum Data Model

This page provides an overview of how Exonum works with the persistent data.

Exonum uses MerkleDB as a storage framework. MerkleDB is an object database. It
represents a high-level wrapper over the key-value store.

Currently [RocksDB][rocks-db] is used for low-level key-value storage engine in
Exonum.

The objects of MerkleDB are convenient abstractions for work with
blockchain-specific data structures. For example, such abstraction can be a
list that provides cryptographic proofs for its stored items.

Currently, the objects in MerkleDB fall into two types:

- **blobs**, which represent sequences of bytes, and
- **root objects**, that do not have parents. These objects have UTF-8
  identifiers, for example, "block", "state". Root objects can contain blob
  items inside them.

The basic root objects of the framework are:

- **list** of items. Each item is preceded by an index which represents a `u64`
  integer. Indices are implicitly defined by the items order
- **map**, where key-value pairs are stored
- **set** of unique items
- **entry**, which represents an optional single item.

and also merkelized versions of lists and maps.

Read more about MerkleDB [here][merkledb].

## System Root Objects

All [root objects][blockchain-schema] in Exonum have `core.*` prefix. Below is a
list of available objects that are used in client applications.

- `transactions: MapIndex`  
  Represents a map from the transaction hash into a raw transaction structure.
- `transaction_results: ProofMapIndex`  
  Keeps execution results for all accepted transactions,
  indexed by transaction hashes.
- `transactions_pool: KeySetIndex`  
  Stores the set of hashes of the known transactions that have not been
  committed yet.
- `transactions_locations: MapIndex`  
  For every transaction hash keeps the position of said transaction inside the
  block and the block height.
- `blocks: MapIndex`  
  Stores the block object for every block height.
- `block_hashes_by_height: ListIndex`  
  Saves block hashes indexed by block heights.
- `block_transactions: ProofListIndex`  
  Stores a list of transactions of a specific block. Transactions of each
  block are grouped by the block height indicated as a prefix.
- `precommits: ListIndex`  
  Stores a list of precommits of the validators for the specific block.
  Precommits for each block are grouped by the block hash indicated as a prefix.
- `configs: ProofMapIndex`  
  Stores the configuration content in JSON format using its hash as a key.
- `configs_actual_from: ListIndex`  
  Stores the hashes of the upcoming configurations together with their
  activation heights. The list allows a simple search for the upcoming
  configuration hash by its height. The discovered hash allows a simple search
  of the corresponding configuration in the `configs`.
- `state_hash_aggregator: ProofMapIndex`  
  An accessory store for summing up the state hash of the whole blockchain.

[rocks-db]: http://rocksdb.org/
[merkledb]: merkledb.md
[blockchain-schema]: https://github.com/exonum/exonum/blob/master/exonum/src/blockchain/schema.rs
