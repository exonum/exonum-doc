# Exonum MerkleDB

Exonum MerkleDB is a persistent storage implementation based on RocksDB
which provides APIs to work with merklized data structures.

MerkleDB is an object database. Objects represent the highest abstraction level
for data storage.

- All objects fall into the following groups: collections, blobs, and special
  objects
- Collections can have unlimited nesting
- Objects of all groups can have hashed or non-hashed variants

There are also root objects that don't have parents and have UTF-8 identifiers,
for example "block", "state".

!!! Warning
Currently, only root objects with blob elements are supported.

1. [Exonum object types](#object-types) lists supported types of
   data storage collections.
2. [Low-level storage](#low-level-storage) explains how object are persisted
   using RocksDB
3. [View layer](#view-layer) describes the wrapper over the DB engine
   that ensures atomicity of blocks and transactions
4. [Indexing](#indexing) gives an insight how indices over structured data
   can be built in Exonum

## Object Types

Root object performs the same role as in relational database
management systems (RDBMSs). However, unlike RDBMS tables,
all MerkleDB objects internally are implemented as wrappers around key-value
stores.
Both keys and values in the wrapped stores are persisted as byte sequences.
MerkleDB does not natively support operations (matching, grouping, sorting, etc.)
over separate value fields, as it is the case with other key-value storages.

### Key Sorting and Iterators

MerkleDB objects implement iterators over stored items (or keys, values, and
key-value
pairs in the case of maps). Such
iterators use key ordering of the underlying key-value storage to determine
the iteration order.
Namely, keys are lexicographically ordered over their binary serializations;
this ordering coincides with that used in
[RocksDB](#low-level-storage).

### MapIndex

[`MapIndex`][map-index] implements a key-value store aka a map. It has
the following functionality:

- Get, set and remove value by key
- Check if a specific key is present in the map
- Iterate over the key-value pairs in the lexicographic key order
- Iterate over keys in the lexicographic key order
- Iterate over values in the lexicographic key order
- Clear the map (i.e., remove all stored key-value pairs)

### ListIndex

[`ListIndex`][list-index] represents an array list.
The following operations are supported:

- Get and set a list item by index
- Append an item to the list
- Pop or poll the last item from the list
- Get the list length
- Check if the list is empty
- Iterate over index-item pairs ordered by index
- Insert a sequence of items from an iterator
- Truncate the list to the specified length
- Clear the list (i.e., remove all stored items from the list)

`ListIndex` does not support inserting items in the middle of the
list or removing items by index
(although it is still possible to implement these operations manually).

!!! summary "Implementation Details"
    `ListIndex` saves its items with 8-byte unsigned item
    indices as keys, serialized in big-endian form (to support proper
    iteration).
    The list length is saved in this map with a
    zero-length byte sequence as a key.

### SparseListIndex

[`SparseListIndex`][sparse-list-index] represents a `ListIndex` that may
contain "gaps". It provides the possibility to delete elements not only from
the end of the list, but from any part thereof. Such deletions do not break
the order of the indices inside the list.

The remaining functionality of the `SparseListIndex` is the same as for
[`ListIndex`](#ListIndex).

### ValueSetIndex

[`ValueSetIndex`][value-set-index] represents a hash set.
The following operations are implemented:

- Add and remove set elements
- Check if an element is already present using the element itself or its hash
- Iterate over stored elements in the lexicographic order of their hashes
- Iterate over hashes of elements in the lexicographic order
- Clear the set (i.e., remove all elements)

The hash used in `ValueSetIndex` is calculated using the `hash()` method
of the `StorageValue` trait.
All built-in types implementing `StorageValue` compute this hash as SHA-256
of the binary serialization of a type instance.

!!! summary "Implementation Details"
    Internally, `ValueSetIndex` uses element hashes as keys,
    and elements themselves as corresponding values.

### KeySetIndex

[`KeySetIndex`][key-set-index] represents a set.
The following procedures are implemented:

- Add and remove set elements
- Check if a specific element is in the set
- Iterate over elements in the lexicographic order
- Clear the set (i.e., remove all stored elements)

!!! summary "Implementation Details"
    Internally, the element is used as a key, and its value is always empty.

#### KeySetIndex vs ValueSetIndex

While `ValueSetIndex` uses a hash as a key, `KeySetIndex` puts an entire binary
serialization of an element into the key.

- `KeySetIndex` does not have an additional overhead on hashing
  set elements.
- `KeySetIndex` should not be used when set elements are relatively big;
  only small elements should be stored in it (such as integers, small strings,
  small
  tuples). On the other hand, the `ValueSetIndex` more easily handles
  storing big and complex elements.
- The `KeySetIndex` introduces a lexicographical order over stored
  elements, while the `ValueSetIndex` orders elements arbitrarily due to hash
  function properties.

### Entry

`Entry` represents an index that contains only one element.

The following operations are implemented:

- Get, set and remove value
- Check if the value is present

### Merkelized Indices

Merkelized indices represent a list and a map with additional
features. Such indices can create the proofs of existence or absence for
stored data items.

When a light client requests data from an Exonum full node, the proof can be
built and sent along with the actual data. Having block headers
and this proof, the client may check that received data was really
authorized by the validators without having to replicate the entire blockchain
contents.

#### ProofListIndex

[`ProofListIndex`][proof-list-index] implements a Merkle
tree, which is a Merkelized version of an
array list. It implements the same methods as `ListIndex`, and adds an
additional feature: based on Merkle trees, `ProofListIndex` allows efficiently
creating compact proofs of existence for the list items.
The following additional procedures are implemented:

- Get the height of the Merkle tree. As the tree is balanced (though may be not
  full), its height is close to `log2` of the list length
- Get the value of the tree root (i.e., the hash of the entire Merkle tree)
- Build a proof of existence/absence for an item at a specific position
- Build a proof of existence/absence for items at a specific contiguous index range

!!! note
    `ProofListIndex` is *append-only*; it does not allow deleting list items.
    The only way to delete an item from a `ProofListIndex` is clearing it.

!!! summary "Implementation Details"
    As with `ListIndex`, list items are stored with 8-byte keys. However,
    `ProofListIndex` also persists all intermediate nodes of the Merkle tree
    built on top of the list, in order to quickly build proofs and recalculate
    the Merkle tree after operations on the list.

#### ProofMapIndex

[`ProofMapIndex`][proof-map-index] is a Merkelized version of a map
based on Merkle Patricia tree.
It implements the same methods as the `MapIndex`, adding the ability to
create proofs of existence for its key-value pairs, or proofs of absence
if a key is absent in the map. The following additional
procedures are supported:

- Get the root node’s value
- Build a proof for the requested key. Tree proves either key
  existence (and its value), or key absence

## Low-level Storage

Exonum uses third-party database engines to persist blockchain state
locally. To use the particular database, a minimal [`Database`][database]
interface should be implemented for it:

- Get a value by a [column family][col-family] name and a key
- Put a new value at the specified column family / key (insert or update
  the saved one)
- Delete a key-value pair by column family name / key

All the objects functionality is reduced to these atomic call types.

Currently the main database engine is [RocksDB][rocks-db].

Values from different objects are stored in single column family in the low-level
storage,
wherein the keys are represented as
a byte sequence, and values are serialized according to Protobuf
serialization format. Keys of a specific objects are mapped to the low-level
storage keys in a deterministic manner using
[object identifiers](#object-identifiers).

### Object Identifiers

Each object in the database has its own unique identifier and metadata.
The metadata can store various information about the internal state of the object.
For example, for [`ListIndex`], its length is stored in the metadata.
Metadata is represented by [`IndexMetadata`] [index-metadata] structure, which
stores object identifier and state.

To obtain object identifiers [object pool] [indexes-pool] is used. Pool
stores the identifier of the last object and increments it when new object
is created. The pool is stored in a separate column family. Key in this
column family is the object identifier, value is the object metadata.

On user level every object is uniquely identified by an address, which is used
to map object keys into a key in the underlying low-level storage. Mapping is
provided by object pool, mentioned before.
An object address consists of 2 parts:

- **String name,** that may contain uppercase and lowercase Latin letters, digits,
  underscores `_`, and periods `.`. By convention, object names in services
  should
  start with [the service name][service-name] and a period. For example,
  the only object in the Cryptocurrency Tutorial is named
  `cryptocurrency.wallets`,
  where `cryptocurrency` is the service name, and `wallets` is the own name
  of the object.
- **Optional prefix** presented as a sequence of bytes (`Vec<u8>` in Rust
  terms).

All objects are stored in the same column-family. Full object key in RocksDB
is a 32-elements byte array. The first 16 bytes is an object identifier
obtained using the pool mentioned above, the second 16 bytes is the key of the
child object. In the database, it looks like this:
`(identifier | key)` - 0x00000000000000100000000000000002

!!! note "Example"
  Suppose we have a list with the address `(" exchange.crypto "," BTC ")` in
  which we put one value, for example `0.00019`. When this list is created pool
  assigned 0x0000000000000003 identifier to it, the value `0.00019` which
  we put in the list will have a key 0x0000000000000000, since this
  a single value in the list. Thus, in the database it will look like this(in
  HEX):
  0x00000000000000030000000000000000 : 0x302E3030303139

Optional prefix is used for backwards compatibility with older versions of
Exonum storage and for grouping objects with similar data.

## View Layer

Exonum introduces additional layer over database to handle transaction
and block atomicity.

### Patches

[Patch][patch] is a set of serial changes that should be applied to
the low-level storage atomically. A patch may include two types of
operations: put a value addressed by a key, or delete a value by a key.

### Snapshots

[Snapshot][snapshot] fixes the storage state at the moment of snapshot
creation and provides a read-only API to it. Even if the storage state
is updated, the snapshot still refers to the old object content.

### Forks

[Forks][fork] implement the same interfaces as the database underneath,
transparently wrapping the real data storage state, and some
additional changes. Every fork is based on the storage snapshot. From
the outer point of view, the changes are eagerly applied to the data
storage; however, these changes are stored directly in the fork and may
be easily rolled back. You can create multiple mutable objects from one
immutable reference to fork.  Moreover, there may be different forks of
the same database snapshot.

Forks are used during transaction and block processing.
A fork [is successively passed](transactions.md#execute)
to each transaction in the block to accumulate changes produced by the
transactions,
in a [patch](#patches).
If one of transactions in the block quits with an unhandled exception (i.e.,
raises `panic`) during
execution, its changes are promptly rolled back, so that execution of the
following
transactions continues normally.

## Indexing

Unlike relational databases, Exonum does not support indices over fields
of object elements as a first-class entity. However, it is
possible to create additional objects with indexing semantics and update their
content together with the objects being indexed.

!!! note "Example"
    The system object `block_transactions` stores a list of transactions
    for every block. `transactions_locations` is an auxiliary object that
    provides
    an index to quickly lookup `block_transactions` by a transaction hash.

[level-db]: http://leveldb.org/
[rocks-db]: http://rocksdb.org/
[map-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/map_index.rs
[list-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/list_index.rs
[sparse-list-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/sparse_list_index.rs
[proof-list-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/proof_list_index/mod.rs
[list-proof]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/proof_list_index/proof.rs
[proof-map-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/proof_map_index/mod.rs
[value-set-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/value_set_index.rs
[key-set-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/key_set_index.rs
[database]: https://github.com/exonum/exonum/blob/b88171f8efa12e92cc1f1b958d53139a5f0e0ae6/components/merkledb/src/db.rs#L452
[patch]: https://github.com/exonum/exonum/blob/b88171f8efa12e92cc1f1b958d53139a5f0e0ae6/components/merkledb/src/db.rs#L146
[snapshot]: https://github.com/exonum/exonum/blob/b88171f8efa12e92cc1f1b958d53139a5f0e0ae6/components/merkledb/src/db.rs#L500
[fork]: https://github.com/exonum/exonum/blob/b88171f8efa12e92cc1f1b958d53139a5f0e0ae6/components/merkledb/src/db.rs#L394
[col-family]: https://github.com/facebook/rocksdb/wiki/Column-Families
[blockchain-schema]: https://github.com/exonum/exonum/blob/master/exonum/src/blockchain/schema.rs
[service-name]: services.md#service-identifiers
[index-metadata]: https://github.com/exonum/exonum/blob/c6ccae1ab43584b67110cbf95146cedfe4b7ea02/components/merkledb/src/views/metadata.rs#L94
[idexes-pool]: https://github.com/exonum/exonum/blob/8072b701aa7e0f639a4af2f3be55823fe2d1345b/components/merkledb/src/views/metadata.rs#L193
