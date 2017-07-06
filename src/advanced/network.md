# Networking Specification

## Network Structure

The Exonum network consists of [_full nodes_](../glossary.md#full-node)
connected via peer-to-peer connections, and [_light clients_](../glossary.md#light-client).

### Full Nodes

**Full nodes** replicate the entire contents of the blockchain and correspond to
replicas in distributed databases. All the full nodes are authenticated with
[public-key cryptography](../glossary.md#digital-signature). Full nodes are
further subdivided into 2 categories:

- [**Auditors**](../glossary.md#auditor) replicate the entire contents of the
  blockchain. They can generate new transactions, but cannot choose which
  transactions should be committed (i.e., cannot generate new blocks)
- [**Validators**](../glossary.md#validator) provide the network liveness. Only
  validators can generate new blocks by using a [Byzantine fault](../glossary.md#byzantine-node)
  tolerant consensus algorithm. Validators receive transactions, verify them,
  and include into a new block. The list of the validators is restricted by
  network maintainers, and normally should consist of 4–15 nodes

### Light Clients

!!! tip
    See [separate article](../architecture/clients.md) for more details on
    _light clients_.

**Light clients** represent clients in the client-server paradigm; they connect
to full nodes to retrieve information from the blockchain they are
interested in, and to send transactions. Exonum provides a [“proofs mechanism”](../glossary.md#merkle-proof),
based on cryptographic commitments via Merkle / Merkle Patricia
trees. This mechanism allows verifying that a response from the full node
has been really authorized by supermajority of validators.

## Communication among Nodes

The nodes communicate with each other via TCP/IP.

Messages in the own [Exonum binary serialization format](../glossary.md#binary-serialization)
are sent over TCP to communicate among the full nodes.

Light clients use [JSON Serialization](../glossary.md#json-serialization)
to interact with the full nodes via [service endpoints](../glossary.md#service-endpoint).
Full nodes uses [Iron framework](http://ironframework.io/) to implement RESTful
HTTP API.

### Network Events Processing

Full nodes use Mio library (version 0.5) for event multiplexing. Each node has
an event loop, through which the node receives events about new messages from
the external network, timeouts, and new transactions received via REST API.

### Transactions Broadcasting

Node broadcasts transactions obtained via API or created by the node itself, but
does not broadcast transactions received from the other nodes (via broadcasting
or [requests mechanism](consensus/requests.md)).

### `Connect` Messages

On establishing connection, the nodes exchange `Connect` messages in which nodes
public keys are indicated. The `Connect` message also contains the public IP
address of the node. Each node stores all received `Connect` messages in
the _list of known peers_. As soon as a handshake is reached (`Connect` message
is received and successfully processed) from both sides, the nodes begin to
exchange messages.

#### Whitelist

If the whitelist is turned on, then upon receiving the `Connect` message, the
node checks the presence of the public key from the message in the node's
whitelist. If the public key is not included in the whitelist, connection is not
accepted.

Whitelist is specified in the `whitelist` section of the [local configuration](../glossary.md#local-configuration):

```TOML
[whitelist]
whitelist_enabled = true
whitelisted_peers = ["99ace6c721db293b0ed5b487e6d6111f22a8c55d2a1b7606b6fa6e6c29671aa1",
"a32464be9bef16a6186a7f29d5ebc3223346faab91ea10cc00e68ba26322a1b0",
"c3f5730d81402e7453df97df2895884e0c49b5cf5ff54737c3dd28dc6537b3fd",
"f542cdc91f73747ecc20076962a2ed91749b8e0af66693ba6f67dd92f99b1533"]
```

#### Peer Discovery

Node sends [`RequestPeers`](consensus/requests.md#requestpeers) to a random
known node regularly with the timeout `peers_timeout` defined in the
[global configuration](../architecture/configuration.md#genesisconsensus).
[In response](consensus/requests.md#requestpeers-1), the addressee sends its
list of known peers. Thus, it is enough to connect to one node at the start and
after some time it will be possible to collect `Connect` messages from the
entire network.

An initial list of IP addresses node obtain from the [local configuration](../glossary.md#local-configuration)
(parameter `listen_address`) on the node start up. If some node changes its IP
address, then through peer discovery mechanism new address becomes known to all
other nodes in some time.
