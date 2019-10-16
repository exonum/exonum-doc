# Node Management

<!-- cspell:ignore nanos -->

Exonum nodes can be controlled using RPC implemented via REST API. The clients
also can  send transactions and obtain information on the blockchain from the
nodes via WebSocket.
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

### Map

`Map` is a collection use for storing key-value pairs.

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

### ListProof

`ListProof` is a JSON object with the following field:

- **val**: Hash  
  [Merkle proof](merkelized-list.md#merkle-tree-proofs) serialized as a hex.

### Time

`Time` is a string that combined date and time in UTC as per [ISO 8601][ISO8601]
(for example, `2018-05-17T10:45:56.057753Z`).

### SerializedTransaction

`SerializedTransaction` is an array of bytes in the Protobuf
[serialization format](../architecture/serialization.md#principles-of-using-protobuf-serialization).

### TransactionInfo

`TransactionInfo` is a JSON object with the following fields:

- **tx_hash**: Hash  
  Hash of a transaction as hex.
- **service_id**: integer  
  ID of the service where belongs the transaction.

### Content

`Content` is a JSON object with the following fields:

- **service_id**: integer  
  ID of the service where belongs the transaction.
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

### Transactions Statistics

```none
GET {system_base_path}/stats
```

Returns transactions statistics for the cache, the pool of unconfirmed
transactions and for the blockchain.

#### Parameters

None.

#### Response

A JSON object with the following fields:

- **tx_pool_size**: integer  
  Amount of unconfirmed transactions.
- **tx_count**: integer  
  Total number of transactions in the blockchain.
- **tx_cache_size**: integer  
  Total number of unconfirmed transactions in the cache.

#### Response Example

```JSON
{
  "tx_pool_size": 0,
  "tx_count": 2,
  "tx_cache_size": 3
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

- **consensus_status**: string  
  Indicates whether consensus is launched on the node. Can be:

    - `active`:  consensus is enabled and the node has enough connected peers  
      for consensus operation
    - `enabled`: consensus is enabled on the node
    - `disabled`: consensus is disabled on the node.

- **connected_peers**: integer
  Indicates the number of nodes connected to the present node.

#### Response Example

```JSON
{
  "consensus_status": "Active",
  "connected_peers": 3
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

### Services Info

```none
GET {system_base_path}/services
```

Returns information on the available services.

#### Parameters

None.

#### Response

A JSON object with the following fields:

- **services**: Array<ServiceInfo\>  
  Information on the available service.

#### Response Example

```JSON
{
  "services": [
    {
      "name": "cryptocurrency",
      "id": 128
    },
    {
      "name": "configuration",
      "id": 1
    }
  ]
}
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

- **type**: string  
  Always equals to `committed`.
- **content**: Content  
  Transaction data in the serialized and deserialized formats.
- **location**: TransactionLocation  
  Transaction position in the blockchain.
- **location_proof**: ListProof  
  Ties transaction to the root hash of the transactions Merkle tree in the
  block.
- **status**: Object  
  [Transaction execution](../architecture/transactions.md#execute) status
- **status.type**: string  
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
- **time**: Time Object  
  Time when the block with the current transaction was committed to the
  blockchain.

<!-- markdownlint-disable MD013 -->
??? example "Response Example"
    ```json
    {
      "type": "committed",
      "content": {
        "service_id": 128,
        "debug": {
          "amount": 10,
          "seed": 6009769846001868842
          },
        "message": "c3b06b072c2179e0e3965062a2c10df1cd37e9dd4c190688848d28ecc78b9093000080000100080a10aac0aea6d7babfb3539a6f6be22350109a134a162d78ee73bcf3035487a224d865f86d835b2e8e979b7af5200762dece6116ad2744eba5a6422c3f052a61a6d12caaef1431842dc403"
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
      },
      "time": "2019-07-17T13:02:41.520395Z"
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
  List of hashes of the precommit messages supporting the block.
- **txs**: Array<TransactionInfo\>  
  List of the transactions included into the block.
- **time**: Time Object  
  Time when the block was committed to the blockchain.

<!-- markdownlint-disable MD013 -->
??? example "Response Example"
    ```json
    {
      "block": {
        "proposer_id": 3,
        "height": 2,
        "tx_count": 1,
        "prev_hash": "14830ace613b0e241de189663e7020c4868d20f47f1e0ad22403b6ff04625ca5",
        "tx_hash": "8df18a9dbb12e7d6eb37ed4804f2c09dd4bf8f55ca9cd0b49668fbf1a6a55d47",
        "state_hash": "fd09172b5945b5b1e2fda94570938897e7205ade1baffffc3af958fbe9e5ef4f"
      },
      "precommits": ["bca4a60d751d9d93205f1997a83fadb492b3eb70d1d987ead73f6a090efbe122010008021002180122220a208037a5fb4808279b5305c44ded205b6d551ec6d255dee15f60235fef3505acf92a220a209416efdec8f26f0abff8c006c64c67ef27c3724dc4b3a33ac852939e774b1c5d320c08f1b8bce90510f8b192f801664a4d93eca26fff5c1cc7854469ca457e60dd1de01dc9ec7e8da46e9bf196a84aa0996cc4b745879de5e6d907e193c52a7e06025e6c798c43fb32429c3df20a", "9b73b31c53c8345924b8a1cf58fa4abf84ff312446f6f7039c85e723655b1fe2010008011002180122220a208037a5fb4808279b5305c44ded205b6d551ec6d255dee15f60235fef3505acf92a220a209416efdec8f26f0abff8c006c64c67ef27c3724dc4b3a33ac852939e774b1c5d320c08f1b8bce90510f8b192f80170a245d73840d06e5b616674800494cee787bcff893e23c06ccfe06e4dd8125e601d357f6c944ff4ecaaa652ece3ad2b32198d868ee90bac2e5e3e828890fd0d", "8396227648fd116ff113d57d0efc971befc862f54126e4e251180a1c082f739801001002180122220a208037a5fb4808279b5305c44ded205b6d551ec6d255dee15f60235fef3505acf92a220a209416efdec8f26f0abff8c006c64c67ef27c3724dc4b3a33ac852939e774b1c5d320c08f1b8bce90510c0f69df801b4ed2af8189426ae7299ff03b4fe23f26063859ef372db3411727dca2170a7eebab26db5616ddc749a44dbb737f1d350fdc93d35c36a04bede84c52b4d94360c"],
      "txs": [{
        "tx_hash": "5820d0e94cb0c49d4991690c6ed61d1eab9351f8c54ed07a498275329efe8eda",
        "service_id": 128
      }],
      "time": "2019-07-17T13:02:41.520395Z"
    }
    ```
<!-- markdownlint-enable MD013 -->

### Blocks in Range

```none
GET {explorer_base_path}/blocks?count={count}&skip_empty_blocks={skip}&latest={latest}&add_blocks_time={add}&add_precommits={add}
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
- **earliest**: integer=  
  Minimum height of the returned blocks. The default value is `Height(0)` (the
  genesis block). `earliest` has the least priority compared to `latest` and
  `count`. It truncates the list of returned blocks if some of them have a
  lesser height. The blocks are returned in reverse order, starting from the
  `latest` and at least up to the `latest - count + 1`. The default maximum
  height of the returned range of blocks is the latest block in the blockchain.
- **add_precommits**: bool=  
  If `true`, then returns and array of precommit hashes collected for every
  returned block. The default value is `false`.
- **add_blocks_time**: bool=  
  If `true`, then returns the median precommit times for every returned block.
  The default value is `false`.

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

<!-- markdownlint-disable MD013 -->
??? example "Response Example"
    Assume the following request

    ```none
    GET {explorer_base_path}/blocks?count=5&skip_empty_blocks=true&add_blocks_time=true&add_precommits=true
    ```

    and response

    ```JSON
    {
      "range": {
        "start": 25,
        "end": 43
      },
      "blocks": [
        {
          "proposer_id": 0,
          "height": 29,
          "tx_count": 31,
          "prev_hash": "6aaeb7fbd1bd508543d9e47eafa2e6b7a4703a04f32b7867fec7ae0f3bb3a5f6",
          "tx_hash": "00706409a70e1a33984a6c4ddcdcbc81b414c08c742be48610541f2d68f06f8c",
          "state_hash": "4e3a346ac15da83bdbee8bd0a25f4cf965fccf23624e04a9ecffb079a4c66cbd",
          "precommits": ["92ecef5261f479b54a16f46b1d6eaf62314de5ecb9f90fe73fd9967798f365b701000801101d180122220a20aabedaf381373218fba0f4890206a6d74eb9341e6a34dde0ac459ee9a50c87a32a220a20d661d9482723822cd4416f12abcc47e1d1d31942db6467b1ebfde8e3c9fe48e5320c08fd86c2e90510e0a4a79a030e619127965433bccee70c726f347add72333a1092116f08784705b849d349acc9f91b353a8e3a99dc72d71b5b018b0d68ac02487232a9d2f7ae9e56eada1503", "3cb840294aea3dce704470e3361f88b4bef5d9de16702532cdfab81ece4f4f110100101d180122220a20aabedaf381373218fba0f4890206a6d74eb9341e6a34dde0ac459ee9a50c87a32a220a20d661d9482723822cd4416f12abcc47e1d1d31942db6467b1ebfde8e3c9fe48e5320c08fd86c2e90510c0ca909a03227efa56e175f1714b8998efe942087c97890cd1c6b040f16fec3a74436c0ad4b8db38e488c22d2a6ba57323a300f9a153f076a941dca98f62f1936960884901"],
          "time": "2019-07-18T14:34:37.860476Z"
        },
        {
          "proposer_id": 1,
          "height": 28,
          "tx_count": 47,
          "prev_hash": "0c7af586be70af3d70ff7b22ce44bb9024fd99e8bdb27d2a35b676fa2fe208b1",
          "tx_hash": "6127e72c21301ce2bba07b3c28b9bb2811ceaef629f545c559080206d217de88",
          "state_hash": "1d72b4ab756cd49cf7386638bb29173c3a725d2059de8ac1339e0e75398ecb4f",
          "precommits": ["92ecef5261f479b54a16f46b1d6eaf62314de5ecb9f90fe73fd9967798f365b701000801101c180122220a207eb780465f7130f3ad0a11903b2b3c02ababf58dda2c3830d84b87fd95edcc3e2a220a206aaeb7fbd1bd508543d9e47eafa2e6b7a4703a04f32b7867fec7ae0f3bb3a5f6320c08fd86c2e90510b8b69bb30262c7abc8b67808f831f9b9c5bdf42071acb23f1937800bc6df60b845b007047937290de22fefc50fb6ab8bbe427900c30921e89346ee237ff1e4f0719a468600", "3cb840294aea3dce704470e3361f88b4bef5d9de16702532cdfab81ece4f4f110100101c180122220a207eb780465f7130f3ad0a11903b2b3c02ababf58dda2c3830d84b87fd95edcc3e2a220a206aaeb7fbd1bd508543d9e47eafa2e6b7a4703a04f32b7867fec7ae0f3bb3a5f6320c08fd86c2e90510b8a9ccb20273f6e3dca17d0c47a68ecac6133b5b7fd2f88a29f386d5a0257d5727c5280218a51944afb518139a2252e9bb16a6c41cb790e16cb89d278df89ef1538e50f906"],
          "time": "2019-07-18T14:34:37.644275Z"
        },
        {
          "proposer_id": 0,
          "height": 27,
          "tx_count": 46,
          "prev_hash": "34bb6716f3c7827f4f1e765fd264907ed64891f10a00d8a6de7d934f2394db20",
          "tx_hash": "20ad61210e5d6b86e8ec821164ebf344d55dc37d5492f3057e55483fdfed11a6",
          "state_hash": "4556595a466e1954e6d2aea9561ee9104de24946fb899bbd9f8d84858ce616b4",
          "precommits": ["92ecef5261f479b54a16f46b1d6eaf62314de5ecb9f90fe73fd9967798f365b701000801101b180122220a20cd6e730e1f63d3ea820512ac060c5f4037741dec3dffe1c13335aabff56305162a220a200c7af586be70af3d70ff7b22ce44bb9024fd99e8bdb27d2a35b676fa2fe208b1320c08fd86c2e90510c8ecdbcd01e8a8bb3eea01a09d2240badb10a2609383cd7abf43198616b751ac1c42181d8887120ac885d75d1d6cb6e2668524382bf34ac3169149adb6fe260b89b5a2e104", "3cb840294aea3dce704470e3361f88b4bef5d9de16702532cdfab81ece4f4f110100101b180122220a20cd6e730e1f63d3ea820512ac060c5f4037741dec3dffe1c13335aabff56305162a220a200c7af586be70af3d70ff7b22ce44bb9024fd99e8bdb27d2a35b676fa2fe208b1320c08fd86c2e90510f8f3fdcd011d7bd0d74f768e3da47110b6ea572a91a2b280920cdfa5d1b2790fbe29955734e1b2d89be6122f5cf616d38dde23de7ec2128d59f47750601c819e358c4acf0a"],
          "time": "2019-07-18T14:34:37.431979Z"
        },
        {
          "proposer_id": 1,
          "height": 26,
          "tx_count": 43,
          "prev_hash": "629d81e20c407e1e952be134a6c1b94ef561922750984fa9aeb4eeba26315856",
          "tx_hash": "467f92426ee4ba949a66dacce935c4f952fb16fe0fc2efd9ff3c21c4c518cc68",
          "state_hash": "5d5aa9e28d6beb6bc5000aefb740c03f76e9e9e7968f6cf35b9b75486d165aa8",
          "precommits": ["92ecef5261f479b54a16f46b1d6eaf62314de5ecb9f90fe73fd9967798f365b701000801101a180122220a2034ffd65e01d03de260a3c0048f6a9728094626a29e1b209e290af7d87c4705ff2a220a2034bb6716f3c7827f4f1e765fd264907ed64891f10a00d8a6de7d934f2394db20320b08fd86c2e90510e0dfe56998b127ed046588f39f780368bd7b99d15ad73b39a1f79540f518ed23572de6f41cf020f0701f4c5f6aa96fcfc0f933a4caca91c663a88a3e7ac8e02fbab51607", "3cb840294aea3dce704470e3361f88b4bef5d9de16702532cdfab81ece4f4f110100101a180122220a2034ffd65e01d03de260a3c0048f6a9728094626a29e1b209e290af7d87c4705ff2a220a2034bb6716f3c7827f4f1e765fd264907ed64891f10a00d8a6de7d934f2394db20320b08fd86c2e90510b0eb93695ef80a36b7d1c82aa463bad29b460de9f9c24382349b1ecfc11a9d3881ff4c1f51add31fd4737bcc65ecd32488b54522a7e678b37aed21f5c29427c0d3672c09"],
          "time": "2019-07-18T14:34:37.221868Z"
        },
        {
          "proposer_id": 0,
          "height": 25,
          "tx_count": 43,
          "prev_hash": "08f2e65419ca13d2efc4cb45023aeb8958f8790a75e8f5675bd09ab7439f0f2f",
          "tx_hash": "897b59be8fcf32143b494e52e56466ef71c2966f8c17a9016d778bb4639c7808",
          "state_hash": "2eb845825ac3bf5fb5b4d45c49ff9b6624a67efee97fa76f3156e029e5038d8a",
          "precommits": ["92ecef5261f479b54a16f46b1d6eaf62314de5ecb9f90fe73fd9967798f365b7010008011019180122220a20b922b31d3e253da7ceefce189fc72caa45c85279f8f0fdf2f437f9aab90422ff2a220a20629d81e20c407e1e952be134a6c1b94ef561922750984fa9aeb4eeba26315856320b08fd86c2e905108090bc06d14727b1ed37d5bfc19e1ffc8d5c298470b3748f814278c771cfdf6656ab8479dd6d011906e708e1fcfe85de21ac3ae59de07f8d2afe5f8eb65e2c9d536bbf02", "3cb840294aea3dce704470e3361f88b4bef5d9de16702532cdfab81ece4f4f1101001019180122220a20b922b31d3e253da7ceefce189fc72caa45c85279f8f0fdf2f437f9aab90422ff2a220a20629d81e20c407e1e952be134a6c1b94ef561922750984fa9aeb4eeba26315856320b08fd86c2e9051098cef806519681b3b6bac8d5fbf24e595ebd2b9488d810f617fa5c6bdf658f2bc4d9885d5ccf6d74a5aa296c229d0faf8ee77e41996a0f8a64aedc3f646f9e511dd9ba0f"],
          "time": "2019-07-18T14:34:37.014559Z"
        }
      ]
    }
    ```
<!-- markdownlint-enable MD013 -->

    That is, to collect `5` non-empty blocks from the tail of the blockchain,
    range from `43` to `25` has been traversed.

## Explorer API Sockets

It is possible to connect to nodes via WebSocket. Clients subscribe to events
that take place in the network and in this way obtain information on the
blockchain from the nodes.

Since Exonum 0.12 version, clients also can send transactions to the blockchain
through websockets alongside with REST API.

Explorer API sockets have the same base path as endpoints, denoted
**{explorer_base_path}** and equal to `/api/explorer/v1`.

### Subscribe to Block Commit

```none
ws://${URL}{explorer_base_path}/blocks/subscribe
```

Connects to a socket and receives notices on each new committed block starting
from the moment of connection. The notices are sent to the light client via the
socket.

#### Parameters

None.

#### Response

Returns notifications that a new block has been committed to the blockchain
starting from the height when the client connected to the socket.

Each notification is a string which can be deserialized into a JSON object that
will contain the following fields:

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

### Subscribe to Transaction Commit

```none
ws://${URL}{explorer_base_path}/transactions/subscribe
```

Connects to a socket and receives notices on each new committed transaction
starting from the moment of connection. The notices are sent to the light
client via the socket.

#### Parameters

- **service_id**: integer  
  ID of the service whose transactions are tracked.
- **message_id**: integer  
  ID of the tracked transaction type. `message_ID` parameter is applicable
  only in combination with the `service_ID` parameter.

#### Response

Returns notifications that a new transaction has been committed to a blockchain
block starting from the height when the client connected to the socket.

Each notification is a string which can be deserialized into a JSON object that
will contain the following fields:

- **type**: string  
  Type of the committed object. Is always equal to `"transaction"`.
- **tx_hash**: Hash  
  Hash of the committed transaction.
- **service_id**: integer  
  ID of the service where belongs the current transaction.
- **message_id**: integer  
  ID of the transaction type.
- **status.type**: string  
  Execution status kind:

    - `"success"` denotes a successfully completed transaction
    - `"error"` denotes a transaction that has returned an error (for example,
      because of transaction parameters not satisfying context-dependent checks)
    - `"panic"` denotes a transaction that has raised a runtime exception
      (for example, attempted to divide by zero).

- **location**: TransactionLocation  
  Transaction position in the blockchain.
- **location_proof**: ListProof  
  Ties transaction to the root hash of the transactions Merkle tree in
  the block.

#### Response Example

```JSON
{
  "type": "transaction",
  "tx_hash": "fe59d6e5bbf493c4ebc112d6241a871671aa238f1c93e2726cf96fea9cb88cdd",
  "service_id": 128,
  "message_id": 2,
  "status": {
    "type": "success"
  },
  "location": {
    "block_height": 317,
    "position_in_block": 0
  },
  "location_proof": {
    "val": "fe59d6e5bbf493c4ebc112d6241a871671aa238f1c93e2726cf96fea9cb88cdd"
  }
}
```

### Subscribe to Multiple Events

```none
ws://${URL}{explorer_base_path}/ws
```

Connects to a socket and receives notices on new committed blocks and the
selected transaction types
starting from the moment of connection. The notices are sent to the light
client via the socket.

#### Request

In order to subscribe to multiple events, it is necessary to send a request
message with the list of filters to the socket. The request message is a text
message in JSON format. The request contains the following fields:

- **type**: string  
  Indicates the type of subscription.
- **payload.type**: string  
  Type of the tracked object. Can be `"blocks"` or `"transactions"`.
- **payload.filter.service_id**: integer  
  ID of the service whose transactions are tracked.
- **payload.filter.message_id**: integer  
  ID of the tracked transaction type. `message_ID` parameter is applicable
  only in combination with the `service_ID` parameter.

To update the filter, it is necessary to send a new request message to the
socket.

#### Request Example

```JSON
{
  "type": "set-subscriptions",
  "payload": [
    {
      "type": "blocks"
    },
    {
      "type": "transactions",
      "filter":
      {
        "service_id": 1,
        "message_id": 2
      }
    }
  ]
}
```

#### Response

Returns notifications that a new block or a transaction has been committed to
the blockchain starting from the height when the client connected to the
socket.

The notifications are the same as in the
[block commit](#subscribe-to-block-commit) and
[transaction commit](#subscribe-to-transaction-commit) subscriptions.

### Sending a Transaction

```none
ws://${URL}{explorer_base_path}/ws
```

Allows sending transactions to the blockchain in the same way as through the
[blockchain explorer](../glossary.md#blockchain-explorer).

#### Request

In order to send a transaction through the WebSocket, it is necessary to send a
text message in JSON format with the transaction hex as through the blockchain
explorer. The message contains the following fields:

- **type**: string  
  Type of the sent object. Always equals to `"transaction"`.
- **payload.tx_body**: SerializedTransaction  
  Body of the sent transaction as hex.

#### Request Example

```JSON
{
  "type": "transaction",
  "payload":
    {
      "tx_body":"838ecb3afdf79011d4bf19b20e2d3accdb12779349182dec73a3c8a709df18430000800002000a05416c6963656f4f0e70c58106aa3a5abded258597e5435b47c75ce34867f3efe795315c7b247b15e70cac34ae2fa1379cc2e46c60597378214ffff0bbb0eeb483836e293700"
    }
}
```

#### Response

Returns notification on inclusion of the transaction to the pool of unconfirmed
transaction.

The notification is a string which can be deserialized into a JSON object that
will contain the following fields:

- **result**: string  
  Always equal to `"success"`. Denotes validity of the transaction for
  inclusion into the pool of unconfirmed transactions.
- **response.tx_hash**: Hash  
  Hash of the transaction as hex.

[closure]: https://github.com/google/closure-compiler/wiki/Annotating-JavaScript-for-the-Closure-Compiler
[explorer]: https://docs.rs/exonum/0.10.3/exonum/api/node/public/explorer/constant.MAX_BLOCKS_PER_REQUEST.html
[blockchain-state]: ../glossary.md#blockchain-state
[ISO8601]: https://en.wikipedia.org/wiki/ISO_8601
