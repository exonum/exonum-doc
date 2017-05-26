# Exonum Data Model

This page reveals how Exonum stores different data, from the lowest (LevelDB) to the high abstract layers that are used in the client applications. Storage architecture can be overlooked from different points.

1. [Exonum table types](#exonum-table-types) lists supported types for data storage. These tables represent the highest level at the data storage architecture.
2. [Low-level storage](#low-level-storage) shows, how Exonum keeps the data on the hard disk. Now LevelDB is used.
3. [DBView layer](#dbview-layer) introduces the wrapper over DB engine. This layer  implement a "sandbox" above the real data and provides block applying atomically.
4. [Table naming convention](#table-naming-convention) elaborates how user tables should be called, and shows how the Exonum tables are matched into LevelDB.
4. [List of system tables](#list-of-system-tables) describes what tables are used directly by Exonum Core.
6. [Indices](#indices) reveals how indices can be built.
5. [Genesis block](#genesis-block) describes how tables are initialized.
6. [Proofs mechanism](#proofs-mechanism) описывает, как строятся и пруфы по Merkle / Merkle Patricia таблицам.

## Exonum table types

Multiple table types may be used in the Exonum applications.

1. `MapTable`
  `Maptable` [\[src\]](https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/map_table.rs) is implementation of Key-Value storage. The following actions are supported:
  - `get(key: &K)` receives a value by key. If Key is not found, error is returned.
  - `put(key: &K, value: V)` inserts new value by key. If such key is already exists, old value is overwritten with new one.
  - `delete(key: &K)` removes appropriate key-value pair. If Key is not found, error is returned.
  - `find_key(origin_key: &K)` returns the nearest key-value pair to the asked one. 
  
  `Maptable` represents the most basic table type. Although other table types do not inherit from it directly, they wrap around `map` field.
2. `ListTable`
  `ListTable` [\[src\]]() represesnts an array list. The following actions are supported:
  - `values()` returns the copy of all values stored in the list. Be careful, values are copied into the memory. It is not advised to use on the big tables.
  - `append(value: V)` adds new value to the end of the list.
  - `extend<I>(iter: I)` appends values from the iterator to the list one-by-one.
  - `get( index: u64)` returns a value already saved in the list. If index is bigger then the list size, error is returned.
  - `set(index: u64, value: V)` updates a value already saved in the list.
  - `last()` returns the latest value in the list.
  - `is_empty()` returns True if nothing was written; else, False.
  - `len()` returns the number of elements stored in the list.
  
  As you may see, List value does not support neither inserting in the middle (although it is still possible), nor deleting.
  Inside, a `ListTable` wraps around `map` storage; usually `MapTable` is used. `ListTable` saves its elements to this map with an element indices as keys.
  
3. `MerkleTable`
  `MerkleTable` [src]() is an extended version for array list. It implements the `ListTable` interface, however adds additional feature. Basing on Merkle Trees, such table allows to create a proofs of existence for its values. 
  The table cells are divided into leafs and and intermediate nodes. Leafs store the data itself; inner nodes values are calculated as `hash(left_child_value | right_child_value)`.
  You may read more detailed specification at [merkle-trees](). The following procedures are implemented:
  - `root_hash()` returns the value of root element (that contains the hash of root node's children).
  - `construct_path_for_range(range_start: u64, range_end: u64)` builds a proof tree for data values at indices `[range_start..range_end - 1]`. The tree consists of `Proofnode` [src]() objects.
  
  When thin client asks Exonum full-node about some data, the proof is built and sent along with the actual data values. Having block headers and such proof, thin client may check that received data was really authorized by the validators.
  
4. `MerklePatriciaTable` [src]() is an extended version for a map. It implements the `Map` interface, adding the ability to create a proofs of existence for its key-value pairs. For a more detailed description, see [merkle-patricia-trees](). The following procedures are supported:
  - `root_hash()` returns the root node's value.
  - `construct_path_to_key(searched_key: A)` builds a proof tree for the requested key. Tree proves either key presence (and its according value), or key absence. The proof tree is used in the same way as in the Merkle Table: it is sent to the client along with the requested data.


## Low-level storage

Exonum uses third-party database engines to save blockchain data locally. To use the particular database, `Map`[src]() inteface should be implemented for it. It means that database should support the following procedures:

- get value by key;
- put new value at the key (insert or update already saved one);
- delete pair by key;
- find the nearest key to the requested one.

In the current moment, key-value storage [LevelDB]() v1.20 is used. Also we plan to add [RocksDB]() support in the near future.

## DBView layer

Для работы с незаппрувленными изменениями введен дополнительный слой Views [src](). Он позволяет форкать и там всякое такое. Патчи, implement Map interface

## Table naming convention

Все таблицы делятся на системные и таблицы сервисов. У каждого сервиса своя область видимости таблиц. При этом, разные сервисы могут иметь таблицы c одинаковыми именами. Аналогом из мира реляционных БД являются схемы: каждому сервису соответствует своя схема.

На уровне LevelDB, все данные всех таблиц Exonum сохраняются в одну LevelDB map.
При этом, ключом является последовательность байт, а значением - сериализованные объекты (тоже, по факту, последовательность байт).

To distinguish values from different tables, additional prefix is used for every key. Such prefix consist of service name and table name.

Сервисы именуются именуются байтовыми последовательностями, начиная с `x01`. Длина имени не ограничена. Имя `x00x00` соответствует Ядру.
Таблицы внутри сервиса именуются байтовыми последовательностями.

Таким образом, ключу `key` в таблице `x00` для сервиса `x00x01` будет соответствовать следующий ключ в LevelDB:
```
x00x01|x00|key
```
 где `|` - это конкатенация байтовых последовательностей.

При именовании таблиц внутри одного сервиса, старайтесь, чтобы имена не были префиксом друг друга.

## List of system tables

Ядро имеет свой список таблиц, нужных для обеспечения работоспособности блокчейна. Эти таблицы создаются вот здесь: [src](https://github.com/exonum/exonum-core/blob/master/exonum/src/blockchain/schema.rs#L47)


Следующие таблицы принадлежат ядру:

- transactions
- tx_location_by_hash
- blocks
- block_hashes_by_height
- block_txs
- precommits
- configs
- configs_actual_from
- state_hash_aggregator

## Indices

Экзонум не поддерживает индексы как отдельную сущность. Однако, вы всегда можете создать дополнительную таблицу со смыслом "индекс". Например, среди системных таблиц `block_txs` - это список транзакций для блока; а `tx_location_by_hash` обеспечивает обратную операцию, высота блока по хешу транзакции.

## Genesis block

При создании генезис-блока, сервисы могут проинициализировать свои таблицы. Для этого сервис должен хэндлить ивент handle_genesis_block: [src](https://github.com/exonum/exonum-core/blob/master/exonum/src/blockchain/mod.rs#L92)
Примите во внимание, что эта процедура вызывается при каждом включении ноды. Примеры реализации вы можете посмотреть в [cryptocurrency-service-genesis-block]()

## Proofs mechanism

`MerklePatriciaTable` and `MerkleTable` позводяют строить доказательства того, что в таблице по данному ключу / индексу лежит именно такое значение. Детали и теория proofs mechanism описаны здесь: [merkle-trees](), [merkle-patricia-trees]()

### MerkleTable proofs

Функция `construct_path_for_range` строит дерево с доказательством. Такое дерево сериализуется в JSON для отправки легкому клиенту. 
