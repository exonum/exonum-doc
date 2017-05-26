# Exonum Data Model

Эта страница описывает, как хранятся различные данные в Exonum-фремворке, начиная с самого низкого уровня (LevelDB), до высокоуровневых абстракций, используемых напрямую пользователями-программистами. 
Архитектуру хранения данных можно рассматривать с нескольких сторон.

1. [Exonum table types](#exonum-table-types) описывает список возможных типов таблиц.
2. [Low-level storage](#low-level-storage) указывает, как Exonum хранит данные на низком уровне. В текущий момент для этого используется LevelDB.
3. [DBView layer](#dbview-layer) описывает обертку вокруг LevelDB-уровня, дающую функциональность форков и еще что-нибудь
4. [Table naming convention](#table-naming-convention) описывает, как должны называться таблицы, и как различные данные таблиц Exonum матчатся в Low-level DB.
4. [List of system tables](#list-of-system-tables) описывает, какие есть служебные таблицы и что в них хранится.
6. [Indices](#indices) описывает, что такое индексы в Exonum.
5. [Genesis block](#genesis-block) описывает, ??? 
6. [Proofs mechanism](#proofs-mechanism) описывает, как строятся и пруфы по Merkle / Merkle Patricia таблицам.

## Exonum table types

Multiple table types may be used in the Exonum applications.

1. `MapTable`
  `Maptable` [\[src\]](https://github.com/exonum/exonum-core/blob/master/exonum/src/storage/map_table.rs) is implementation of Key-Value storage. The following actions are supported:
  - `get(key: &K)` receives a value by key. If Key is not found, error is returned.
  - `put(key: &K, value: V)` insert new value by key. If such key is already exists, old value is overwritten with new one.
  ...
  тут еще список функций всяких разных..
  
  `Maptable` represents the most basic table type. Все остальные типы базируются на нем.
2. `ListTable`
3. `MerkleTable`
4. `MerklePatriciaTable`

## Low-level storage

Для сохранения данных локально на диск, экзонум использует сторонние database engines. Для того, чтобы использовать какую-либо СУБД, необходимо реализовать `Map` [src]() интерфейс для неё, а именно, СУБД должна поддерживать слеующие процедуры:
- get
- put
- delete
- find_key
В текущий момент используется LevelDB v1.20. В будущем планируется добавить поддержку RocksDB.

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
