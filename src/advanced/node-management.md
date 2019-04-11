# Node management

<!-- cspell:ignore nanos -->

Exonum nodes can be controlled using RPC implemented via REST API and WebSocket.
Managing endpoints are handled by Exonum core and are mainly purposed to receive
information about the current node and blockchain states as well as to change
node [local configuration](../architecture/configuration.md#local-parameters).

Endpoints are divided into two types: private and public endpoints. Each
endpoint type is hosted at a separate address, which is specified in the
[`api` section](../architecture/configuration.md#api) of the local
configuration.

## Types

As per [Google Closure Compiler][closure] conventions,
`?` before the type denotes a nullable type, and `=` after the type denotes
an optional type.

### Integer

`integer` type denotes a non-negative integer number.

### Bool

`bool` type denotes a boolean value: `true` or `false`.

### Hash, PublicKey, Signature

`Hash`, `PublicKey`, `Signature` types are hexadecimal strings of the
appropriate length. `Hash` and `PublicKey` are 32 bytes (that is, 64 hex
digits). `Signature` is 64 bytes (that is, 128 hex digits).

### PeerAddress

`PeerAddress` is a string containing address in `IP:port` format. `IP` is IPv4
or IPv6 address formatted as 4 octets separated by dots (for example,
`10.10.0.1`).

### ConnectInfo

`ConnectInfo` is a JSON object with the following two fields:

- **address**: string  
  Address of the peer.
- **public_key**: PublicKey  
  Public key of the connected peer.

### OutgoingConnectionState

`OutgoingConnectionState` is a JSON object with the following fields:

- **type**: string  
  Connection type, can be:

    - `Active` for established connections
    - `Reconnect` for yet unestablished connections.

- **delay**: integer=  
  Interval between reconnect attempts (ms). Is present only if `type` is
  `Reconnect`.

### OutgoingConnectionInfo

`OutgoingConnectionInfo` is a JSON object with the following fields:

- **public_key**: ?PublicKey  
  Public key of the peer or `null` if the public key is unknown.
- **state**: OutgoingConnectionState  
  Current connection state.

### ServiceInfo

`ServiceInfo` is a JSON object with the following fields:

- **id**: integer  
  Unique service identifier.
- **name**: string  
  Unique string service identifier.

### BlockHeader

`BlockHeader` is a JSON object with the following fields:

- **height**: integer  
  Height of the block.
- **prev_hash**: Hash  
  Hash of the previous block.
- **proposer_id**: integer  
  ID of the validator that created an approved block proposal.
- **state_hash**: Hash  
  Hash of the current [Exonum state][blockchain-state] after applying
  transactions in the block.
- **tx_count**: integer  
  Number of transactions included into the block.
- **tx_hash**: Hash  
  Root hash of the transactions Merkle tree.

### Time

`Time` is a string that combined date and time in UTC as per [ISO 8601][ISO8601]
(for example, `2018-05-17T10:45:56.057753Z`).

### SerializedTransaction

`SerializedTransaction` is an array of bytes in the Protobuf
[serialization format](../architecture/serialization.md#message-serialization).

### Content

`Content` is a JSON object with the following fields:

- **debug**: object  
  Transaction in the deserialized format.  
- **message**: SerializedTransaction  
  Array of bytes of a transaction serialized according to the Protobuf
  serialization format.

### TransactionLocation

`TransactionLocation` is a JSON object with the following fields:

- **block_height**: integer  
  Height of the block including this transaction.
- **position_in_block**: integer  
  Position of the transaction in the block.

## System API Endpoints

All system API endpoints share the same base path, denoted
**{system_base_path}**, equal to `/api/system/v1`.

## Public Endpoints

### Number of Unconfirmed Transactions

```none
GET {system_base_path}/mempool
```

Returns the number of transactions in the node pool of unconfirmed transactions.

#### Parameters

None.

#### Response

A JSON object with the following fields:

- **size**: integer  
  Amount of unconfirmed transactions.

#### Response Example

```JSON
{
  "size": 0
}
```

### Healthcheck

```none
GET {system_base_path}/healthcheck
```

Returns information whether the node is connected to other peers.

#### Parameters

None.

#### Response

A JSON object with the following fields:

- **connectivity**: string or JSON object  
  Indicates the number of peers the node is connected to or `NotConnected` if
  the node is not connected to any peers.
- **consensus_status**: string  
  Indicates whether consensus is launched on the node. Can be:

    - `active`:  consensus is enabled and the node has enough connected peers  
      for consensus operation
    - `enabled`: consensus is enabled on the node
    - `disabled`: consensus is disabled on the node.

#### Response Example

```JSON
{
  "consensus_status": "Active",
  "connectivity": {
    "Connected": {
      "amount": 1
    }
  }
}
```

### User Agent Info

```None
GET {system_base_path}/user_agent
```

#### Parameters

None.

#### Example

```none
curl http://127.0.0.1:7780/api/system/v1/user_agent
```

#### Response

Returns a string containing information about Exonum, Rust and OS version.

#### Response Example

```None
"exonum 0.10.2/rustc 1.32.0 (9fda7c223 2019-01-16)\n\n/Mac OS10.14.3"
```

## Private Endpoints

### Add New Peer

```none
POST {system_base_path}/peers
```

Adds new Exonum node to the list of peers for the present node.
The latter will attempt to [connect](network.md#connect-messages) to the new
node asynchronously.

#### Parameters

- **address**: PeerAddress  
  IP address of the node which the present node should connect to.
- **public_key**: PublicKey  
  Public key of the node which the present node should connect to.

#### Example

```None
curl -H "Content-Type: application/json" \
  --data '{
    "address": "127.0.0.1:8800",
    "public_key":
      \"dcb46dceaeb7d0eab7b6ed000f317f2ab9f7c8423ec9a6a602d81c0979e1333a"
  }' \
  http://127.0.0.1:8081/api/system/v1/peers
```

#### Response

```json
null
```

### Peers Info

```none
GET {system_base_path}/peers
```

Returns a list of peers.

#### Parameters

None.

#### Response

A JSON object with the following fields:

- **incoming_connections**: Array<ConnectInfo\>  
  Information on the peers connected to the present node.
- **outgoing_connections**: Map  
  The keys of the map are addresses of peers the present node is connected to,
  corresponding values of type `OutgoingConnectionInfo` contain info about
  public keys and current connection status of peers.

??? example "Response Example"
    ```json
    {
      "incoming_connections": [{
        "address": "127.0.0.1:57671",
        "public_key": "8a17bdfe42c10abdb7f27b5648691db3338400c27812e847e02eb7193ad490f2"
      }],
      "outgoing_connections": {
        "127.0.0.1:6334": {
          "public_key": "dcb46dceaeb7d0eab7b6ed000f317f2ab9f7c8423ec9a6a602d81c0979e1333a",
          "state": {
            "type": "Active"
          }
        },
        "127.0.0.1:6335": {
          "public_key": "dcb46dceaeb7d0eab7b6ed000f317f2ab9f7c8423ec9a6a602d81c0979e1333a",
          "state": {
            "delay": 4000,
            "type": "Reconnect"
          }
        },
        "127.0.0.1:6336": {
          "public_key": null,
          "state": {
            "type": "Active"
          }
        },
        "127.0.0.1:6337": {
          "public_key": null,
          "state": {
            "delay": 4000,
            "type": "Reconnect"
          }
        }
      }
    }
    ```

### Consensus Enabled Info

```none
GET {system_base_path}/consensus_enabled
```

Returns a boolean value representing if the node participates in consensus.

#### Parameters

None.

#### Response

A JSON boolean.

#### Response Example

```JSON
true
```

### Enable/Disable Consensus Interaction

```none
POST {system_base_path}/consensus_enabled
```

Switches consensus interaction of the node on or off.

#### Parameters

- **enabled**: `bool`

#### Example

```None
curl -H "Content-Type: application/json" --data '{"enabled":false}' http://127.0.0.1:7780/api/system/v1/consensus_enabled
```

#### Response

```json
null
```

### Network Info

```none
GET {system_base_path}/network
```

Gets info about the serialization protocol and the services functioning
in the network.

#### Parameters

None.

#### Response

A JSON object with the following fields:

- **core_version**: string  
  Current applied version of the Exonum framework.
- **protocol_version**: integer  
  Major version of the Exonum serialization protocol. Currently, `1`.
- **services**: Array<ServiceInfo\>  
  Info about services functioning in the network.

#### Response Example

```JSON
{
  "core_version": "0.10.2",
  "protocol_version": 1,
  "services": [
    {
      "id": 128,
      "name": "cryptocurrency"
    },
    {
      "name": "configuration",
      "id": 1
    }
  ]
}
```

### Shutdown

```none
POST {system_base_path}/shutdown
```

After receiving a shutdown message, the node stops processing
transactions, participating in consensus and terminates after
all messages in the event queue are processed.

#### Parameters

None.

#### Example

```none
curl -H "Content-Type: application/json" --data 'null' http://127.0.0.1:7780/api/system/v1/shutdown
```

#### Response

```json
null
```

### Rebroadcast

```none
POST {system_base_path}/rebroadcast
```

Rebroadcast all transactions from the pool to other validators.

#### Parameters

None.

#### Example

```none
curl -H "Content-Type: application/json" --data 'null' http://127.0.0.1:7780/api/system/v1/rebroadcast
```

#### Response

```json
null
```

## Explorer API Endpoints

All explorer API endpoints share the same base path, denoted
**{explorer_base_path}**, equal to `/api/explorer/v1`.

All explorer endpoints are public.

### Transaction

```none
GET {explorer_base_path}/transactions?hash={transaction_hash}
```

Searches for a transaction, either committed or uncommitted, by the hash.

#### Parameters

- **transaction_hash**: Hash  
  Hash of the transaction to be searched.

#### Response

Returns a transaction from the pool of unconfirmed transactions if it is not
committed yet, otherwise, returns a transaction from the blockchain.

Response is a JSON object with one required field:

- **type**: string  
  Transaction type, can be:

    - `committed`: committed transaction (in blockchain)
    - `in-pool`: uncommitted transaction (in the pool of unconfirmed
      transactions)
    - `unknown`: unknown transaction.

The object may also contain other fields, which depend on `type` and are
outlined below.

##### Unknown Transaction

Response JSON contains only `type` field. Its value is `unknown`. Additionally,
the HTTP status of the response is set to 404.

??? example "Response Example"
    ```json
    {
      "type": "unknown"
    }
    ```

##### Known Uncommitted Transaction

Response JSON has the same fields as
[`Content`](#content) plus `type` field with value equal to `"in-pool"`.

<!-- markdownlint-disable MD013 -->
??? example "Response Example"
    ```json
    {
      "type": "in-pool",
      "content": {
        "debug": {
          "to": {
            "data": [242, 39, 156, 45, 245, 89, 252, 58, 143, 174, 88, 196, 76, 225, 223, 206, 177, 125, 63, 3, 90, 36, 128, 213, 70, 37, 243, 231, 174, 139, 81, 151]
          },
          "amount": 10,
          "seed": 9587307158524814255
        },
        "message": "ba76da2363c062f3dc25f5e353d0f8de2e3d02896b9c8f01683dbde7e3194eb90000800000000a220a20f2279c2df559fc3a8fae58c44ce1dfceb17d3f035a2480d54625f3e7ae8b5197100a18afc7b9838aa2bd8685019a6bf7a720fdfdf27948330d0a451f35aef3eb64f80f568136be91d2667f75b7eb4b03ba279b70c69bbf5b69db8d8edf5e1049f51c86e937c10d1408374faa08"
      }
    }
    ```
<!-- markdownlint-enable MD013 -->

##### Known Committed Transaction

Response is a JSON object with the following fields:

- **type**: `"committed"`  
  Always equals to `committed`.
- **content**: Content  
  Transaction data in the serialized and deserialized formats.
- **location**: TransactionLocation  
  Transaction position in the blockchain.
- **location_proof**: ListProof  
  [Merkle proof](merkelized-list.md#merkle-tree-proofs) serialized as a hex
  tying transaction to the `tx_hash` of the containing block.
- **status**: Object  
  [Transaction execution](../architecture/transactions.md#execute) status
- **status.type**: `"success"` | `"error"` | `"panic"`  
  Execution status kind:

    - `"success"` denotes a successfully completed transaction
    - `"error"` denotes a transaction that has returned an error (for example,
      because of transaction parameters not satisfying context-dependent checks)
    - `"panic"` denotes a transaction that has raised a runtime exception
      (for example, attempted to divide by zero).

- **status.code**: integer  
  Error code supplied by the service developer. Only present for erroneous
  transactions. Has service-specific meaning.
- **status.description**: string=  
  Optional human-readable error description. Only relevant for erroneous and
  panicking transactions.

<!-- markdownlint-disable MD013 -->
??? example "Response Example"
    ```json
    {
      "type": "committed",
      "content": {
        "debug": {
          "to": {
            "data": [174, 116, 3, 32, 153, 158, 51, 93, 212, 245, 253, 192, 70, 143, 52, 235, 70, 84, 74, 161, 153, 91, 108, 172, 252, 237, 200, 36, 40, 189, 113, 221]
          },
          "amount": 10,
          "seed": 2084648087298472854
        },
        "message": "41c453a7f45cb0dd73644aa376d3802bb7da4c6797bcf6749211fbcabb5aa8710000800000000a220a20ae740320999e335dd4f5fdc0468f34eb46544aa1995b6cacfcedc82428bd71dd100a1896f7fda8bf8c8af71cfccd80d4c0d5d6f82955cf7c081969282604d3f7e416274a4319484ceea947981b8d337bd170210acd62508f3663acba395bd131456c0b6cd7f09690aec68a05"
      },
      "location": {
        "block_height": 11,
        "position_in_block": 0
      },
      "location_proof": {
        "val": "2f23541b10b258dfc80693ed1bf6ed6f53ccf8908047f7d33e0fec4f29a4a613"
      },
      "status": {
        "type": "success"
      }
    }
    ```
<!-- markdownlint-enable MD013 -->

### Block by Height

```none
GET {explorer_base_path}/block?height={height}
```

Returns content of the block at a specific height.

#### Parameters

- **height**: integer  
  Height of the desired block.

#### Response

A JSON object with the following fields:

- **block**: BlockHeader  
  Header of the specified block.
- **precommits**: Array<Hash\>  
  List of hashes of the 'Precommit' messages supporting the block.
- **txs**: Array<SerializedTransaction\>  
  List of the transactions included into the block.
- **time**: time object  
  Time when the block was committed to the blockchain.

<!-- markdownlint-disable MD013 -->
??? example "Response Example"
    ```json
    {
      "block": {
        "proposer_id": 3,
        "height": 1,
        "tx_count": 1,
        "prev_hash": "fd510fc923683a4bb77af8278cd51676fbd0fcb25e2437bd69513d468b874bbb",
        "tx_hash": "336a4acbe2ff0dd18989316f4bc8d17a4bfe79985424fe483c45e8ac92963d13",
        "state_hash": "79a6f0fa233cc2d7d2e96855ec14bdcc4c0e0bb1a99ccaa912a555441e3b7512"
      },
      "precommits": ["a410964c2c21199b48e278b64bb72e2b8b20374df1ba5c8a846d34de9254a706010008031001180222220a2017ba87030093c7f27a73d7f987f36d0b731c015a1fdefe9d2799e45eaa26148f2a220a202e2c737dc5e902084b252991dbcd7c978565bb76b271d27681a675c81bdbbfae320b08e4ee95e30510f09da312b91820e1a9b0132c32d608e5206bf5fe119c54c17424ef6f6c70b13490761ddd36f855e2c74e37c7aa7e1ac648893164a07ed413c2c0065738d6bea8825bbf04",
      "0776a07b194e1a9b918205331e0c1f62de82d5b23efccb5922624cb928b620c901001001180222220a2017ba87030093c7f27a73d7f987f36d0b731c015a1fdefe9d2799e45eaa26148f2a220a202e2c737dc5e902084b252991dbcd7c978565bb76b271d27681a675c81bdbbfae320b08e4ee95e30510e8bfe11105fcd4562131756c6f6c64d0e63f4cca67bf718fb43a1ca45161ee3328c97c2582ab70f40406d4b2aa5fc967e2b177b897a3cf2dc0a674df4eccb45f75db8900",
      "57b745d4e157299ede29129ba039a039e6f145aae3852481937ac1972b2ed131010008011001180222220a2017ba87030093c7f27a73d7f987f36d0b731c015a1fdefe9d2799e45eaa26148f2a220a202e2c737dc5e902084b252991dbcd7c978565bb76b271d27681a675c81bdbbfae320b08e4ee95e30510d8eee11143e792e3c8a72403fc3dc259f3e8e0c3de867be4555fb809e7c8f79ce9449d15020b9060eb6d41efb5079bd25147dc2a5f3071b9bb7ed2fc8751468e750b310d"],
      "txs": ["336a4acbe2ff0dd18989316f4bc8d17a4bfe79985424fe483c45e8ac92963d13"],
      "time": "2019-02-14T14:12:52.037255Z"
    }
    ```
<!-- markdownlint-enable MD013 -->

### Blocks in Range

```none
GET {explorer_base_path}/blocks?count={count}&skip_empty_blocks={skip}&latest={latest}&add_blocks_time={add}
```

Returns the block headers from the specified range. The range
defines its smallest and largest block heights. The amount of collected
blocks from the traversed range should not exceed `count` value.

#### Parameters

- **count**: integer  
  Number of blocks to return. Should not be greater than
  [`MAX_BLOCKS_PER_REQUEST`][explorer].
- **skip_empty_blocks**: bool=  
  If `true`, then only non-empty blocks are returned. The default value is
  `false`.
- **latest**: integer=  
  Maximum height of the returned blocks. The blocks are returned
  in reverse order, starting from the `latest` and at least up to the `latest -
  count + 1`. The default value is the height of the latest block in the
  blockchain.
- **add_blocks_time**: bool=  
  If `true`, then returns an array of `time` objects. The time value
  corresponds to the average time of submission of precommits by the
  validators for every returned block. The default value is `false`.

#### Response

The JSON object of the explored block range `range` and the array `blocks` of
the `BlockHeader` objects. The range defines its largest and the smallest
heights of blocks. The amount of collected blocks from the traversed range
should not exceed `count` value.
The largest height `end` equals to `latest + 1` if provided or to the height of
the latest block in the blockchain, the smallest height `start` takes values
in `0..latest - count + 1`. Blocks in the array are sorted in the descending
order
according to their heights. Height of any block in the array is greater than or
equal to `start` and is less than `end`.

??? example "Response Example"
    Assume the following request

    ```none
    GET {explorer_base_path}/blocks?count=5&skip_empty_blocks=true&add_blocks_time=true
    ```

    and response

    ```JSON
    {
      "range": {
        "start": 6,
        "end": 288
      },
      "blocks": [
        {
          "proposer_id": 3,
          "height": 26,
          "tx_count": 1,
          "prev_hash": "932470a22d37a5a995519e01c50eab7db9e0e978f5b17f8342030ae3f066af82",
          "tx_hash": "5cc41a2a7cf7c0d3a15ab6ca775b601208dba7d506e2f27368702b3334d37583",
          "state_hash": "4d7bb34d7913e0784c24a1e440532e72900eb380129a54dbaac6ad9286f9d567"
        },
        {
          "proposer_id": 2,
          "height": 21,
          "tx_count": 1,
          "prev_hash": "aa4ec89740a4ec380e8bcab0aedd0f5449184eb33b65ede5bb67e5e55e2dd004",
          "tx_hash": "dcb05a3bd61f9b637335472802d8ab6026c8486dae3b4062ce48d561949c49af",
          "state_hash": "e4ea2c6118326c6b00cd14ec7b8fb4cbf198eb4e65149ef3a96761740fc516c6"
        },
        {
          "proposer_id": 1,
          "height": 16,
          "tx_count": 1,
          "prev_hash": "7183517c34e94ecc10a3e13269da2bfadb6e87eea86453a1946ebdfa9c4dae83",
          "tx_hash": "362bc50ed56d33944a0d33fbac2a25fc08ceb8dc1aced1f38147b3da3d022bc1",
          "state_hash": "00cca5682b677d4b4ac644d2ddae09ca5e260fb67c735df22774f2e983d24ef5"
        },
        {
          "proposer_id": 0,
          "height": 11,
          "tx_count": 1,
          "prev_hash": "9297ef66d1d9ec286c00aec779f2dc273b3371e792bbc9c6635d00f9c4a6fa80",
          "tx_hash": "c7aa20695380846e3f274d3d51c68e864e66e46f2618aa5fbd55d597675b9e6a",
          "state_hash": "deb57ff0f82c9d2514dc51785675544e27b3054512ea62dce2c8e30ce6d91e77"
        },
        {
          "proposer_id": 3,
          "height": 6,
          "tx_count": 1,
          "prev_hash": "dbec8f64a85ab56985c7ab7e63a191764f4d5c373c677f719c2f9ddf13b9d5a1",
          "tx_hash": "ffee3d630f137aecff95aece36cfe4dc1b42f688d474219cb30d44c85cf36b1f",
          "state_hash": "8ac9f2af6266b8e9b61fa7f3fcdd170375fb1bf8cc8d474904abe3672b44906e"
        }
      ],
      "times": [
        "2019-02-21T13:01:44.321051Z",
        "2019-02-21T13:01:43.287648Z",
        "2019-02-21T13:01:42.251382Z",
        "2019-02-21T13:01:41.228900Z",
        "2019-02-21T13:01:40.199265Z"
      ]
    }
    ```

    That is, to collect `5` non-empty blocks from the tail of the blockchain,
    range from `288` to `6` has been traversed.

## Explorer API Sockets

Since Exonum 0.10 version, it is possible to connect to nodes via WebSocket.

Explorer API sockets have the same base path as endpoints, denoted
**{explorer_base_path}** and equal to `/api/explorer/v1`.

Currently only one socket is implemented - it shares information on block
commit events.

### Subscribe to Block Commit

```none
ws://${URL}{explorer_base_path}/blocks/subscribe
```

Connects to a socket and receives notices on each new committed block starting
from the moment of connection. The notices are displayed in the blockchain
explorer.

#### Parameters

None.

#### Response

Returns notifications that a new block has been committed to the blockchain
starting from the height when the client connected to the socket.

Each notification is a JSON object with the following fields:

- **height**: integer
  Height of the new block committed to the blockchain.
- **prev_hash**: Hash
  Hash of the previous block.
- **proposer_id**: integer
  ID of the validator that created an approved block proposal.
- **state_hash**: Hash
  Hash of the current [Exonum state][blockchain-state] after applying
  transactions in the new block.
- **tx_count**: integer
  Number of transactions included into the newly-committed block.
- **tx_hash**: Hash
  Root hash of the transactions Merkle tree in the newly-committed block.

#### Response Example

```JSON
{  
   "height":13002,
   "prev_hash":"03d19b9821a5336d3be63840ccdfa119269bd7671672a1715a71a745770f025a",
   "proposer_id":3,
   "state_hash":"2d5bc93ec12ab46b5197281da7557d58e438d2aac24e58c784815f4ad77a2d24",
   "tx_count":3,
   "tx_hash":"9135c961f53c16d791daf1d9180d34eefcd23e50c5a02f915153493d4a905fbb"
}
```

[closure]: https://github.com/google/closure-compiler/wiki/Annotating-JavaScript-for-the-Closure-Compiler
[explorer]: https://docs.rs/exonum/0.10.3/exonum/api/node/public/explorer/constant.MAX_BLOCKS_PER_REQUEST.html
[blockchain-state]: ../glossary.md#blockchain-state
[ISO8601]: https://en.wikipedia.org/wiki/ISO_8601
