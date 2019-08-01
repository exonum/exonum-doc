# Networking Specification

**Exonum network** consists of [full nodes](../glossary.md#full-node)
connected via peer-to-peer connections, and
[light clients](../glossary.md#light-client).
Full nodes communicate with each other
using [Exonum binary serialization format](../glossary.md#binary-serialization)
over TCP, and clients interact with full nodes via REST service interface and
WebSockets.

## Network Structure

### Full Nodes

**Full nodes** store the entire contents of the blockchain. All the full nodes
are authenticated with
[public-key cryptography](../glossary.md#digital-signature).
Full nodes are further subdivided into 2 categories:

- [**Auditors**](../glossary.md#auditor) replicate the entire contents of the
  blockchain. They can generate new transactions, but cannot choose which
  transactions should be committed (i.e., cannot generate new blocks)
- [**Validators**](../glossary.md#validator) exchange consensus messages with
  each other to reach consensus and add new blocks into the blockchain.
  Validators receive transactions, verify them,
  and include into a new block. The list of the validators is restricted by
  network maintainers, and normally should consist of 4–16 nodes.

!!! note
    The operability of the network with 4-16 validators has been verified by
    our research team. See section 7.3 of our [whitepaper][whitepaper] on the
    Exonum consensus algorithm. Meanwhile, the system may operate with a
    larger number of validators.

### Light Clients

!!! tip
    See [separate article](../architecture/clients.md) for more details on
    _light clients_.

**Light clients** represent clients in the client-server paradigm; they connect
to full nodes for several purposes:

- to [retrieve](node-management.md#explorer-api-endpoints) information they are
  interested in from the blockchain
- to [subscribe](node-management.md#explorer-api-sockets) to events like block
  commits and transaction commits and be aware of new accepted blocks and
  transactions
- to send transactions.

Exonum also provides a [“proofs mechanism”](../glossary.md#merkle-proof),
based on cryptographic commitments via Merkle / Merkle Patricia
trees. This mechanism enables light clients to verify that a response from the
full node has been really authorized by a supermajority of validators.

## Peer-to-Peer Full Node Network

Full nodes use the
[Exonum binary serialization format](../glossary.md#binary-serialization)
over TCP to communicate with each other.

Starting with Exonum 0.8, all network connections are encrypted using
[Noise Protocol][noise]. The Protocol starts with a handshake message
exchange. The handshake includes exchange of [public keys][DH] and
[connect messages](#connect-messages) by the nodes. In order to authenticate
the  connection, the sender includes the receiver's public key into its
handshake message.

As a result of the Diffie-Hellman key agreement, the nodes receive a shared
secret key. This key is then used to send encrypted messages between these
nodes.

Noise Protocol protects Exonum against a number of potential vulnerabilities,
for example, traffic sniffing between nodes.

!!! warning
    Nodes compiled with previous versions of Exonum will not connect to nodes
    updated to 0.8 and further.

[The Tokio library][tokio-lib] is used for event multiplexing. Each node has
an event loop, through which the node receives events about new messages from
the external network, timeouts, and new transactions sent via REST API and/or
WebSocket.

Messages exchanged by full nodes include consensus messages and transactions.

### Transaction Broadcasting

A node broadcasts transactions obtained via API or created by the node itself,
but does not broadcast transactions received from other nodes (via
broadcasting or [requests mechanism](consensus/requests.md)).

### Consensus Messages and Requests

Validators generate and process consensus messages as specified
by [the consensus algorithm](consensus/specification.md).
Auditor nodes are set not to receive consensus messages (`Propose`, `Prevote`,
`Precommit`) when they are broadcast by the validators.

### `Connect` Messages

On establishing a P2P connection, nodes exchange `Connect` messages
in which a node indicates its public key. The `Connect` message also contains
the public IP
address of the node. Each node stores all received `Connect` messages in
the _list of known peers_. As soon as a handshake is reached (the `Connect`
message is received and successfully processed) from both sides, the nodes begin
to exchange messages.

#### Peer Discovery

`listen_address` is the address where each node in the network accepts
connections from other peers.

Each node regularly sends [`PeersRequest`](consensus/requests.md#peersrequest)
to a random known node with the timeout `peers_timeout` defined in the
[global configuration](../architecture/configuration.md#genesisconsensus).
[In response](consensus/requests.md#peersrequest-1), the addressee sends its
list of known peers. Thus, it is enough to connect to one node at the start and
after some time it will be possible to collect `Connect` messages from the
entire network.

At the same time, the initial list of addresses, where other full nodes may
be specified, is defined in the
[local configuration](../glossary.md#local-configuration)
(parameter `connect_list`) of the node. This list is used to discover
the initial set of peers on the node start up. If some node changes its address,
then through peer discovery mechanism a new address becomes known to
all other nodes in some time.

Meanwhile, the addresses in the `connect_list` may be specified both as host
names and IP addresses.

## Communication with Light Clients

Light clients interact with full nodes via
[service REST API endpoints](../glossary.md#service-endpoint) and via
WebSockets. Full nodes receive transactions from light clients via POST
requests, and light clients get info from full nodes via GET requests.
Transactions from light clients are authenticated with the help of
signatures, which are the part of JSON serialization of transactions. Read
requests are generally not authenticated.

Full nodes use [Actix-web framework](https://actix.rs) to implement REST
HTTP API and WebSockets. Addresses for public and private API endpoints are
specified in the [`API`](../architecture/configuration.md#api) section of the
local configuration.

### Service Endpoints

API endpoints for a particular service are defined via
[`wire_api` hook](../architecture/services.md#rest-api-initialization).
All service endpoints are prefixed with
[`/api/services/{service_name}`](../architecture/services.md#service-identifiers),
where `service_name` is a string service identifier. This identifier needs
to be unique within a specific Exonum blockchain.

!!! note
    There is no unified format for naming endpoints (e.g., passing parameters
    for GET endpoints via path components and/or query parameters).
    Thus, services need to use best practices for REST services.

!!! note "Example"
    The [configuration update service](configuration-updater.md) defines the
    following endpoints among others:

    - `GET /api/services/configuration/v1/configs/{config_hash}`  
      Looks up the global configuration by its hash
    - `POST /api/services/configuration/v1/configs/postpropose`  
      Proposes new configuration of the service

    Note that both endpoints are prefixed with `/api/services/configuration`
    prefix as specified above (an additional common prefix `v1` is used for
    forward-compatible
    versioning). The POST endpoint consumes urlencoded JSON representation
    of the corresponding service transaction, as it can be inferred from the
    semantics of POST requests. The GET endpoint consumes `{config_hash}` param,
    which is specified as a part of the URL path.

[tokio-lib]: https://tokio.rs/
[whitepaper]: https://bitfury.com/content/downloads/wp_consensus_181227.pdf
[noise]: https://noiseprotocol.org/
[DH]: https://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange
