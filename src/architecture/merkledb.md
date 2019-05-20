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

## Root Object Types

Root objects perform the same role as in relational database
management systems (RDBMSs). However, unlike RDBMS tables,
all MerkleDB objects internally are implemented as wrappers around key-value
stores.

Root objects in MerkeDB fall into several types:
- **list**, where either keys or values are stored
- **map**, where key-value pairs are stored
- **set** of unique items
- **entry**, which represents a set containing only one item.

Both keys and values in the wrapped stores are persisted as byte sequences.
MerkleDB does not natively support operations (matching, grouping, sorting,
etc.) over separate value fields, as it is the case with other key-value
storages.

### Key Sorting and Iterators

MerkleDB objects implement iterators over stored items. The stored items are:

- keys or values in case of list objects, sets or entries
- key-value pairs in case of map objects.

Such iterators use key ordering of the underlying key-value storage to
determine the iteration order. Namely, keys are lexicographically ordered
according to their binary serializations. This ordering coincides with that
used in [RocksDB](storage.md).

### MapIndex

[`MapIndex`][map-index] implements a key-value store aka a map. It has
the following functionality:

- Get, set and remove value by key
- Check if a specific key is present in the map
- Iterate over the key-value pairs in the lexicographic key order
- Iterate over keys in the lexicographic key order
- Iterate over values in the lexicographic key order
- Clear the map (i.e., remove all stored key-value pairs).

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
- Clear the list (i.e., remove all stored items from the list).

`ListIndex` does not support inserting items in the middle of the
list or removing items by index
(although it is still possible to implement these operations manually).

!!! summary "Implementation Details"
    To support proper iteration, `ListIndex` saves its items with 8-byte
    unsigned indices as keys. The indices are serialized in the big-endian form.

### SparseListIndex

[`SparseListIndex`][sparse-list-index] represents a `ListIndex` that may
contain "gaps". It provides the possibility to delete items not only from
the end of the list, but from any part thereof. Such deletions do not break
the order of the indices inside the list.

The remaining functionality of the `SparseListIndex` is the same as for
[`ListIndex`](#ListIndex).

### ValueSetIndex

[`ValueSetIndex`][value-set-index] represents a hash set.
The following operations are implemented:

- Add and remove set items
- Check if an item is already present using the item itself or its hash
- Iterate over stored items in the lexicographic order of their hashes
- Iterate over hashes of items in the lexicographic order
- Clear the set (i.e., remove all items).

The hash used in `ValueSetIndex` is calculated using the `object_hash()` method
of the [`ObjectHash` trait][object-hash].

!!! summary "Implementation Details"
    Internally, `ValueSetIndex` uses hashes of items as keys,
    and items themselves as corresponding values.

### KeySetIndex

[`KeySetIndex`][key-set-index] represents a set.
The following procedures are implemented:

- Add and remove set items
- Check if a specific item is in the set
- Iterate over items in the lexicographic order
- Clear the set (i.e., remove all stored items).

!!! summary "Implementation Details"
    Internally, the item is used as a key, and its value is always empty.

#### KeySetIndex vs ValueSetIndex

While `ValueSetIndex` uses a hash as a key, `KeySetIndex` puts an entire binary
serialization of an item into the key.

- `KeySetIndex` does not have an additional overhead on hashing
  set items.
- `KeySetIndex` should not be used when set items are relatively big;
  only small items should be stored in it (such as integers, small strings,
  small
  tuples). On the other hand, `ValueSetIndex` handles storing big and complex
  items more easily.
- `KeySetIndex` introduces a lexicographical order over stored
  items. In `ValueSetIndex` items are ordered according to their hash
  function properties.

### Entry

`Entry` represents a set that contains only one item.

The following operations are implemented:

- Get, set and remove value
- Check if the value is present.

### Merkelized Objects

Merkelized objects represent a list and a map with additional
features. Such objects can create proofs of existence or absence for
stored data items.

When a light client requests data from an Exonum full node, the proof can be
built and sent along with the actual data. Having block headers
and this proof, the client may check that the received data was really
authorized by the validators without having to replicate the entire blockchain
contents.

#### ProofListIndex

[`ProofListIndex`][proof-list-index] implements a Merkle
tree, which is a merkelized version of an
array list. It implements the same methods as `ListIndex`, and adds an
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
    `ProofListIndex` is an *append-only* store; it does not allow deleting list
    items. The only way to delete an item from a `ProofListIndex` is clearing
    it.

!!! summary "Implementation Details"
    As with `ListIndex`, list items are stored with 8-byte keys. However,
    `ProofListIndex` also persists all intermediate nodes of the Merkle tree
    built on top of the list, in order to quickly build proofs and recalculate
    the Merkle tree after operations on the list.

#### ProofMapIndex

[`ProofMapIndex`][proof-map-index] is a merkelized version of a map
based on the Merkle Patricia tree.
It implements the same methods as `MapIndex`. It is also able to
create proofs of existence for its key-value pairs, or proofs of absence
if a key is absent in the map. The following additional
procedures are supported:

- Get the value of the root node
- Build a proof for the requested key. The tree proves either key
  existence (and its value), or key absence.

[rocks-db]: http://rocksdb.org/
[map-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/map_index.rs
[list-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/list_index.rs
[sparse-list-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/sparse_list_index.rs
[proof-list-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/proof_list_index/mod.rs
[proof-map-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/proof_map_index/mod.rs
[value-set-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/value_set_index.rs
[key-set-index]: https://github.com/exonum/exonum/blob/master/components/merkledb/src/key_set_index.rs
[object-hash]: https://github.com/exonum/exonum/blob/b88171f8efa12e92cc1f1b958d53139a5f0e0ae6/components/merkledb/src/hash.rs#L205
