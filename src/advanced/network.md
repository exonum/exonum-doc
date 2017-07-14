# Networking Specification

**The Exonum network** consists of [full nodes](../glossary.md#full-node)
connected via peer-to-peer connections, and [light clients](../glossary.md#light-client).
Full nodes communicate with each other
using [Exonum binary serialization format](../glossary.md#binary-serialization)
over TCP, and clients interact with full nodes via a RESTful service interface.

## Network Structure

### Full Nodes

**Full nodes** store the entire contents of the blockchain. All the full nodes
are authenticated with [public-key cryptography](../glossary.md#digital-signature).
Full nodes are further subdivided into 2 categories:

- [**Auditors**](../glossary.md#auditor) replicate the entire contents of the
  blockchain. They can generate new transactions, but cannot choose which
  transactions should be committed (i.e., cannot generate new blocks)
- [**Validators**](../glossary.md#validator) exchange consensus messages with
  each other to reach consensus and add new block into the blockchain.
  Validators receive transactions, verify them,
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

## Peer-to-Peer Full Node Network

Full nodes use the [Exonum binary serialization format](../glossary.md#binary-serialization)
over TCP to communicate with each other.
Mio library is used for event multiplexing. Each node has
an event loop, through which the node receives events about new messages from
the external network, timeouts, and new transactions received via REST API.

Messages exchanged by full nodes include consensus messages and transactions.

### Transaction Broadcasting

Node broadcasts transactions obtained via API or created by the node itself, but
does not broadcast transactions received from the other nodes (via broadcasting
or [requests mechanism](consensus/requests.md)).

### Consensus Messages and Requests

Validators generate and process consensus messages as specified
by [the consensus algorithm](consensus/specification.md).
Auditor nodes are set not to receive consensus messages (`Propose`, `Prevote`,
`Precommit`) when they are broadcast by the validators.

### `Connect` Messages

On establishing a P2P connection, the nodes exchange `Connect` messages
in which a node indicates its public key. The `Connect` message also contains
the public IP
address of the node. Each node stores all received `Connect` messages in
the _list of known peers_. As soon as a handshake is reached (`Connect` message
is received and successfully processed) from both sides, the nodes begin to
exchange messages.

#### Whitelist

If the whitelist is turned on, then upon receiving the `Connect` message, the
node checks the presence of the public key from the message in the node’s
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

A node obtains an initial list of IP addresses from the [local configuration](../glossary.md#local-configuration)
(parameter `listen_address`) on the node start up. If some node changes its IP
address, then through peer discovery mechanism new address becomes known to all
other nodes in some time.

## Communication with Light Clients

Light clients use [JSON serialization](../glossary.md#json-serialization)
to interact with the full nodes via [service endpoints](../glossary.md#service-endpoint).
Full nodes receive transactions from the light clients via POST
requests, and the light clients get info from the full nodes via GET requests.
Transactions from the light clients are authenticated with the help of signatures,
which are the part of JSON serialization of transactions. Read requests are generally
not authenticated.

Full nodes uses [Iron framework](http://ironframework.io/) to implement RESTful
HTTP API. Addresses for public and private API endpoints are specified in the
[`node.api`](../architecture/configuration.md#nodeapi) section of the local
configuration.

### Service Endpoints

Endpoints for a particular service are defined via
[`public_api_handler` and `private_api_handler` hooks](../architecture/services.md#rest-api-initialization).
All service endpoints are prefixed with [`/api/services/{service_name}`](../architecture/services.md#service-identifiers),
where `service_name` is a string service identifier. This identifier needs
to be unique within a specific Exonum blockchain.

!!! note
    There is no unified format for naming endpoints (e.g., passing parameters for
    GET endpoints via path components and/or query parameters).
    Thus, services need to use best practices for RESTful services.

!!! note "Example"
    The [configuration update service](configuration-updater.md) defines the following
    endpoints among others:

    - `GET /api/services/configuration/v1/configs/{config_hash}`  
      Looks up the global configuration by its hash
    - `POST /api/services/configuration/v1/configs/postpropose`  
      Proposes new configuration of the service

    Note that both endpoints are prefixed with `/api/services/configuration` prefix
    as specified above (an additional common prefix `v1` is used for forward-compatible
    versioning). The POST endpoint consumes urlencoded JSON representation
    of the corresponding service transaction, as it can be inferred from the semantics
    of POST requests. The GET endpoint consumes `{config_hash}` param, which is
    specified as a part of the URL path.
