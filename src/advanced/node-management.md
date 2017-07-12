# Node management

Exonum nodes can be controlled via RPC implemented as REST API. Managing endpoints are handled by Exonum Core and mainly are purposed to receive information about the current node and blockchain states.

## API endpoints

The managing endpoints URL is structured as follows:

`{base_path}/system/v1/mempool`
## Add new peer POST

`POST {base_path}/system/v1/peeradd`

Add new node to the list of peers.
####Parameters
- **ip** : peer address in format `ip:port`. 

####Example:
```
➜  sandbox-timestamping git:(master) ✗ curl --data "ip=127.0.0.1:8800" http://127.0.0.1:7780/api/system/v1/peeradd

"Ok"%

```    

##Getting peers info

`GET {base_path}/system/v1/peers`

Get network information, about peers.

####Parameters

None.

####Example

```
➜  sandbox-timestamping git:(master) curl --get  http://127.0.0.1:7778/api/system/v1/peers
{
  "incoming_connections": [127.0.0.1:76638],
  "outgoing_connections": [127.0.0.1:6332],
  "reconnects": [
    {
      "addr": "127.0.0.1:6335",
      "delay": 2000
    },
    {
      "addr": "127.0.0.1:6336",
      "delay": 2000
    },
    {
      "addr": "127.0.0.1:6334",
      "delay": 2000
    }
  ]
}%   
```
- **incoming_connections**: List of peers connected to us.
- **outgoing_connections**: List of peers where we connected.
- **reconnects**: List of nodes where we should reconnect.
- **addr**: Peer address.
- **delay**: Time in which we should reconnect (ms).

##Getting pool information

`GET {base_path}/system/v1/mempool `

Getting information about pool.

####Parameters

None.

####Example

``` ➜  sandbox-timestamping git:(master) ✗ curl --data "ip=127.0.0.1:8800" --get  http://127.0.0.1:7780/api/system/v1/mempool
{
  "size": 0
}        
```

- **size**: count of unconfirmed transactions.

##Getting transaction from mempool

`GET {base_path}/system/v1/mempool/:hash`

Return transaction from pool.

####Unknown Transaction
If we trying to request unknown transaction.

```--get  http://127.0.0.1:7780/api/system/v1/mempool/d24e650f552bbb382f23d275630c1413d526d49a8a4c577cadf43a3363bf02cd 

{
  "type": "Unknown"
}% 
```

#### For transaction in mempool

If we trying to request transaction that wasn't commited yet.

```curl --get  http://127.0.0.1:7780/api/system/v1/mempool/f6415994136527a24d022595ec0d40f51e2a0c4230a34792a5203df779e3ffaf
{
  "body": {
    "amount": "152",
    "from": "b0d6af8bbe45c574c5f9dd8876b5b037b38d1bf861fd7b90744957aa608ed0c2",
    "seed": "2953135335240383704",
    "to": "99e396355cb2146aba0457a954ebdae36e09e3abe152693cfd1b9a0975850789"
  },
  "message_id": 128,
  "network_id": 0,
  "protocol_version": 0,
  "service_id": 128,
  "signature": "7d3c503d6dc02ca24faaeb37af227f060d0bcf5f40399fae7831eb68921fd00407f7845affbd234f352d9f1541d7e4c17b4cd47ec3f3208f166ec9392abd4d00",
  "type": "MemPool"
}%   
```
#### Getting committed transaction

If we trying to request already commited transaction.

```curl --get  http://127.0.0.1:7780/api/system/v1/mempool/f6415994136527a24d022595ec0d40f51e2a0c4230a34792a5203df779e3ffaf
{
  "content": {
    "body": {
      "amount": "152",
      "from": "b0d6af8bbe45c574c5f9dd8876b5b037b38d1bf861fd7b90744957aa608ed0c2",
      "seed": "2953135335240383704",
      "to": "99e396355cb2146aba0457a954ebdae36e09e3abe152693cfd1b9a0975850789"
    },
    "message_id": 128,
    "network_id": 0,
    "protocol_version": 0,
    "service_id": 128,
    "signature": "7d3c503d6dc02ca24faaeb37af227f060d0bcf5f40399fae7831eb68921fd00407f7845affbd234f352d9f1541d7e4c17b4cd47ec3f3208f166ec9392abd4d00"
  },
  "location": {
    "block_height": "18",
    "position_in_block": "261"
  },
  "proof_to_block_merkle_root": {
    "left": "07e641264ac4646495c54a379a5943bf88785bcf30a0b4c13f47d1e2e62b343d",
    "right": {
      "left": {
        "left": {
          "left": {
            "left": {
              "left": {
                "left": "78044db9c2713a11c2fe7bb66f27665b6ca0ecbb9e61e09381534d449c4c24c4",
                "right": {
                  "left": {
                    "left": "f62e6a4d8b9c2c0cfb31ea599e08e6e3fe2337169ce07008d91390958e0613d4",
                    "right": {
                      "val": "f6415994136527a24d022595ec0d40f51e2a0c4230a34792a5203df779e3ffaf"
                    }
                  },
                  "right": "daee36b5b7c24a831a62539d534c56e4f234a83ce83876fee48193d8eefabfb2"
                }
              },
              "right": "df8bb7e697e6eb7828975b67f64a77af06379435f4330f0cb0b7a21d18b616db"
            },
            "right": "59ab567cf0d1c09c5050680ea4ed4650238023666b0e5d90855d82dc83d1f982"
          },
          "right": "cf5fa45701ba6ae795da58a504eb1608075d7bbedf05c8f6f448aad4dbd03968"
        },
        "right": "eb583ba724a3b371c243f1268dfca2929c704fe0546875e5dfeb90860ac3533f"
      },
      "right": "bea1bae302dbf975cafa064ecfbc39f2cdcba5fe7ffddb2208c060cd9778c483"
    }
  },
  "type": "Commited"
}%  
```

- **type** - type of transaction, could be:

1. Commited - commited transaction (in blockchain).
2. MemPool - uncommited transaction (in mempool).
3. Unknown - unknown transaction.


```sandbox-timestamping git:(master) curl --get  http://127.0.0.1:7778/api/system/v1/network
{
  "network_id": 0,
  "protocol_version": 0,
  "services": [
    {
      "id": 128,
      "name": "cryptocurrency"
    }
  ]
}% 
```