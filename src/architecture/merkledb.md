# Exonum MerkleDB

Exonum MerkleDB is a persistent storage implementation based on
[RocksDB][rocks-db]. MerkleDB provides APIs to work with merkelized data
structures.

MerkleDB is an object database. Objects represent the highest abstraction level
for the [data storage](storage.md). All objects fall into the following groups:

- **blobs** which represent sequences of bytes
- **root objects** that do not have parents. These objects have UTF-8
  identifiers, for example, "block", "state". Root objects can contain blob
  items inside them.

The rest of the article describes the following:

1. [Root Objects Types](#root-object-types) lists the types of data
   stores supported by MerkleDB. Objects represent the highest abstraction
   level for the data storage.
2. [Low-level storage](#low-level-storage) explains how objects are persisted
   using RocksDB.
3. [View layer](#view-layer) describes the wrapper over the DB engine
   that ensures atomicity of blocks and transactions.
4. [Indexing](#indexing) explains how indices over structured data can be
   built in MerkleDB.

## Root Object Types

Root objects perform the same role as tables in relational database
management systems (RDBMSs). All MerkleDB objects internally are
implemented as wrappers around key-value stores.

Root objects in MerkleDB fall into several types:

- **list** of items
- **map**, where key-value pairs are stored
- **set** of unique items
- **entry**, which represents an optional single item.

Both keys and values in the wrapped stores are persisted as byte sequences.
MerkleDB does not natively support operations (matching, grouping, sorting,
etc.) over separate value fields, as it is the case with other key-value
storages.

### MapIndex

[`MapIndex`][map-index] implements a key-value store aka a map. It has
the following functionality:

- Get, set and remove value by key
- Check if a specific key is present in the map
- Iterate over the key-value pairs in the lexicographic key order
- Iterate over keys or values in the lexicographic key order
- Clear the map (i.e., remove all stored key-value pairs)
- Get the total number of items in the object.

### ListIndex

[`ListIndex`][list-index] represents an array list.
The following operations are supported:

- Get and set a list item by an index
- Append an item to the list
- Pop or poll the last item from the list
- Get the list length
- Check if the list is empty
- Iterate over index-item pairs ordered by indices
- Extend the list by adding a sequence of items from an iterator to the end of
  the list
- Truncate the list to the specified length
- Clear the list (i.e., remove all stored items from the list)
- Get the total number of items in the list.

`ListIndex` does not support inserting items in the middle of the
list or removing items by the index
(although it is still possible to implement these operations manually).

!!! summary "Implementation Details"
    To support proper iteration, 8-byte unsigned indices precede `ListIndex`
    items. Indices are implicitly defined by the items order. Indices are
    serialized in the big-endian form.

### SparseListIndex

[`SparseListIndex`][sparse-list-index] represents a `ListIndex` that may
contain "gaps". It provides the possibility to delete items not only from
the end of the list, but from any part thereof. Such deletions do not break
the order of the indices inside the list.

The remaining functionality of the `SparseListIndex` is the same as for
[`ListIndex`](#ListIndex). As in `ListIndex`, extension of the list is
possible only by adding a sequence of items from an iterator to the end of the
list.

### ValueSetIndex

[`ValueSetIndex`][value-set-index] represents a hash set.
The following operations are implemented:

- Add and remove set items
- Check if an item is already present using the item itself or its hash
- Iterate over stored items in the lexicographic order of their hashes
- Iterate over hashes of items in the lexicographic order
- Clear the set (i.e., remove all items)
- Get the total number of items in the object.

Hashes used in `ValueSetIndex` are calculated with the `object_hash()` method
of the [`ObjectHash` trait][object-hash].

!!! summary "Implementation Details"
    Internally, `ValueSetIndex` uses hashes of items as keys,
    and items themselves as corresponding values.

### KeySetIndex

[`KeySetIndex`][key-set-index] represents a set.
The following procedures are implemented:

- Add and remove set items
- Check if a specific item is in the set
- Iterate over items in the lexicographic order of their binary representation
- Clear the set (i.e., remove all stored items)
- Get the total number of items in the object.

!!! summary "Implementation Details"
    Internally, the item is used as a key, and its value is always empty.

#### KeySetIndex vs ValueSetIndex

While `ValueSetIndex` uses a hash as a key, `KeySetIndex` puts an entire binary
serialization of an item into the key.

- `KeySetIndex` does not have an additional overhead on hashing
  set items.
- `KeySetIndex` should not be used when set items are relatively big;
  only small items should be stored in it (such as integers, small strings,
  small tuples). On the other hand, `ValueSetIndex` handles storing big and
  complex items more easily.
- `KeySetIndex` introduces a lexicographical order over stored
  items. In `ValueSetIndex` items are ordered according to their hash
  function properties.

### Entry

`Entry` represents an optional single item (i.e., `Option<T>` in Rust terms).

The following operations are implemented:

- Get, set and remove the value
- Check if the value is present.

### Merkelized Objects

Merkelized objects represent a list and a map with additional
features. Such objects can create proofs of existence or absence for
stored data items.

When a [light client](clients.md) requests data from a full node,
the proof can be built and sent along with the actual data. Having block
headers and this proof, the client may check that the received data was really
authorized by the validators without having to replicate the entire blockchain
contents.

#### ProofListIndex

[`ProofListIndex`][proof-list-index] implements a Merkle
tree, which is a merkelized version of an
array list. It implements the same methods as `ListIndex` except for
truncation of the list. `ProofListIndex` adds an
additional feature: based on Merkle trees, `ProofListIndex` allows efficiently
creating compact proofs of existence for the list items.
The following additional procedures are implemented:

- Get the height of the Merkle tree. As the tree is balanced (though may be not
  full), its height is close to `log2` of the list length
- Get the value of the tree root (i.e., the hash of the entire Merkle tree)
- Build a proof of existence/absence for an item at a specific position
- Build a proof of existence/absence for items at a specific contiguous list
  range.

!!! note
    Unlike `ListIndex`, `ProofListIndex` is an *append-only* store; it does
    not allow deleting list items. The only way to delete an item from a
    `ProofListIndex` is clearing it.

!!! summary "Implementation Details"
    As with `ListIndex`, list items are stored with 8-byte keys. However,
    `ProofListIndex` also persists all intermediate nodes of the Merkle tree
    built on top of the list, in order to quickly build proofs and recalculate
    the Merkle tree after operations on the list.

#### ProofMapIndex

[`ProofMapIndex`][proof-map-index] is a merkelized version of a map
based on the binary Merkle Patricia tree.
It implements the same methods as `MapIndex`. It is also able to
create proofs of existence for its key-value pairs, or proofs of absence
if a key is absent in the map. The following additional
procedures are supported:

- Get the value of the root node
- Build a proof for the requested key. The tree proves either key
  existence (and its value), or key absence.

## Low-level Storage

MerkleDB uses a third-party database engine to persist blockchain state
locally. Currently the main database engine is [RocksDB][rocks-db]. It is also
possible to plug in other engines.

To use a particular database, a minimal [`Database`][database]
interface should be implemented for it:

- Get a value by a [column family][col-family] name and a key
- Put a new value at the specified column family / key (insert or update
  the saved one)
- Delete a key-value pair by a column family name / key.

All the objects functionality is reduced to these atomic call types.
Values of items of different objects are stored in a single column family in
the low-level storage. Their keys are mapped to the low-level storage keys in a
deterministic manner using [object identifiers](#object-identifiers).

### Object Identifiers

On user level every object is uniquely identified by an address. An object
address consists of 2 parts:

- **String name** that may contain uppercase and lowercase Latin letters,
  digits, underscores `_`, hyphens `-` and periods `.`. By convention, object
  names in services should start with [the service name][service-name] and a
  period. For example, the only object in the Cryptocurrency Tutorial is named
  `cryptocurrency.wallets`, where `cryptocurrency` is the service name, and
  `wallets` is the own name of the object
- **Optional prefix** presented as a sequence of bytes (`Vec<u8>` in Rust
  terms). Prefixes allow to group items inside objects. They allow to obtain
  a particular subset of items marked by the prefix from the object.

The object address maps the object to the corresponding unique identifier. To
obtain object identifiers [object pool][indexes-pool] is used. The pool
stores identifiers of all available objects. The pool assigns identifiers to
the objects incrementally as soon as new objects appear.

The pool is stored in a separate column family. Key in this column family is
the object address presented in bytes, value is the
[`IndexMetadata`][index-metadata] structure, which stores the object
identifier and some object metadata.

The object metadata can store various information about the internal state of
the object. For example, for [`ListIndex`], the metadata stores the length of
the list.

An object key in RocksDB consists of two parts:

- an **object identifier** obtained from the object pool
- an **index of an item** inside the object.

Both parts of the key are encoded as big-endian.

!!! note "Example"
    Suppose we have a list with the address `(" exchange.crypto "," BTC ")` in
    which we put one value, for example `7865`. The pool assigns a
    pseudo-random identifier `3` to this list when we create it. In the
    database the identifier looks like this - `0x0000000000000003`.

    Since `7865` is a single value in the created list, its index in the
    database looks like this - `0x0000000000000000`.

    Thus, the whole key in the database will look as follows (in HEX) -
    `0x00000000000000030000000000000000 : 0x_bd1e_0000_0000_0000`.

### Key Sorting and Iterators

MerkleDB objects support iterating over object contents:

- items for lists and sets
- keys, values or key-value pairs in case of map objects.

Such iterators use key ordering of the low-level key-value storage to
determine the iteration order. Namely, keys are lexicographically ordered
according to their binary serializations.

## View Layer

Exonum introduces additional layer over the database to handle transaction
and block atomicity.

### Patches

[Patch][patch] is a set of serial changes that should be applied to
the low-level storage atomically. A patch may include two types of
operations: put a value addressed by a key, or delete a value by a key.

### Snapshots

[Snapshot][snapshot] fixes the storage state at the moment of snapshot
creation and provides a read-only API to it. Even if the storage state
is updated, the snapshot still refers to the old content of the stored objects.

### Forks

[Forks][fork] implement the same interfaces as the database underneath,
transparently wrapping the real data storage state, and some
additional changes. Every fork is based on the storage snapshot. From
the outer point of view, the changes are eagerly applied to the data
storage; however, these changes are stored directly in the fork and may
be easily rolled back. You can create multiple mutable objects from one
immutable reference to the fork. Moreover, there may be different forks of
the same database snapshot.

Forks are used during transaction and block processing. A fork
[is successively passed](transactions.md#execute)
to each transaction in the block to accumulate changes produced by the
transactions. If one of the transactions in the block
quits with an unhandled exception during execution, its
changes are promptly rolled back, so that execution of the following
transactions continues normally.

## Indexing

Unlike relational databases, Exonum does not support indices over fields
of object items as a first-class entity. However, it is
possible to create auxiliary objects with indexing semantics. Content of the
auxiliary objects should be updated according to the content of the original
objects that they index.

!!! note "Example"
    The system object `block_transactions` stores a list of transactions
    for every block. `transactions_locations` is an auxiliary object that
    provides an index to quickly look up `block_transactions` by a transaction
    hash.

[rocks-db]: http://rocksdb.org/
[map-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/map_index.rs
[list-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/list_index.rs
[sparse-list-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/sparse_list_index.rs
[proof-list-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/proof_list_index/mod.rs
[proof-map-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/proof_map_index/mod.rs
[value-set-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/value_set_index.rs
[key-set-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/key_set_index.rs
[object-hash]: https://github.com/exonum/exonum/blob/b88171f8efa12e92cc1f1b958d53139a5f0e0ae6/components/merkledb/src/hash.rs#L205
[database]: https://github.com/exonum/exonum/blob/b88171f8efa12e92cc1f1b958d53139a5f0e0ae6/components/merkledb/src/db.rs#L452
[snapshot]: https://github.com/exonum/exonum/blob/b88171f8efa12e92cc1f1b958d53139a5f0e0ae6/components/merkledb/src/db.rs#L500
[fork]: https://github.com/exonum/exonum/blob/b88171f8efa12e92cc1f1b958d53139a5f0e0ae6/components/merkledb/src/db.rs#L394
[col-family]: https://github.com/facebook/rocksdb/wiki/Column-Families
[service-name]: services.md#service-identifiers
[index-metadata]: https://github.com/exonum/exonum/blob/c6ccae1ab43584b67110cbf95146cedfe4b7ea02/components/merkledb/src/views/metadata.rs#L94
[indexes-pool]: https://github.com/exonum/exonum/blob/8072b701aa7e0f639a4af2f3be55823fe2d1345b/components/merkledb/src/views/metadata.rs#L193
